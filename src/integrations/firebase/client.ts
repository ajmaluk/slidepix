import { authClient } from "@/lib/authClient";
import { firebaseDb } from "@/lib/firebaseClient";
import { resolveEdgeFunctionsBaseUrl } from "@/lib/apiConfig";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  QueryConstraint,
  documentId,
  getCountFromServer
} from "firebase/firestore";

type PlainObject = Record<string, any>;
type QueryFilter = {
  op: "eq" | "neq" | "in" | "gte" | "lte" | "gt" | "lt" | "not_is";
  column: string;
  value: any;
};
type OrderRule = { column: string; ascending: boolean };
type SelectOptions = { count?: "exact" | null; head?: boolean };

type CompatResult<T> = {
  data: T;
  error: Error | null;
  count: number | null;
};

function normalizeEdgeBaseUrl(): string {
  return resolveEdgeFunctionsBaseUrl();
}

function withDocId(data: PlainObject, id: string): PlainObject {
  if (data.id) return data;
  return { id, ...data };
}

function splitTopLevelCsv(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      const token = current.trim();
      if (token) parts.push(token);
      current = "";
      continue;
    }
    current += ch;
  }

  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

type ParsedSelect = {
  includeAll: boolean;
  scalarFields: string[];
  relations: Array<{
    alias: string;
    relation: string;
    fields: string[];
    rawToken: string;
  }>;
};

function parseRelationToken(token: string): {
  alias: string;
  relation: string;
  fields: string[];
} | null {
  const trimmed = token.trim();
  const openIndex = trimmed.indexOf("(");
  const closeIndex = trimmed.lastIndexOf(")");
  if (openIndex <= 0 || closeIndex <= openIndex) {
    return null;
  }

  const head = trimmed.slice(0, openIndex).trim();
  const inner = trimmed.slice(openIndex + 1, closeIndex).trim();
  if (!head) return null;

  const aliasMatch = head.match(/^(?:(\w+):)?([A-Za-z0-9_]+)(?:![^\s(]+)?$/);
  if (!aliasMatch) {
    return null;
  }

  return {
    alias: aliasMatch[1] || aliasMatch[2],
    relation: aliasMatch[2],
    fields: inner ? splitTopLevelCsv(inner).map((f) => f.trim()).filter(Boolean) : [],
  };
}

function parseSelect(selectClause: string): ParsedSelect {
  const trimmed = selectClause.trim();
  if (!trimmed || trimmed === "*") {
    return { includeAll: true, scalarFields: [], relations: [] };
  }

  const tokens = splitTopLevelCsv(trimmed);
  const scalarFields: string[] = [];
  const relations: ParsedSelect["relations"] = [];
  let includeAll = false;

  for (const token of tokens) {
    if (token === "*") {
      includeAll = true;
      continue;
    }

    const parsedRelation = parseRelationToken(token);
    if (parsedRelation) {
      relations.push({
        alias: parsedRelation.alias,
        relation: parsedRelation.relation,
        fields: parsedRelation.fields,
        rawToken: token,
      });
      continue;
    }

    scalarFields.push(token);
  }

  return { includeAll, scalarFields, relations };
}

async function loadCollectionRows(table: string): Promise<PlainObject[]> {
  const snap = await getDocs(collection(firebaseDb, table));
  return snap.docs.map((item) => withDocId(item.data() as PlainObject, item.id));
}

// eslint-disable-next-line unused-imports/no-unused-vars
function applyFilters(rows: PlainObject[], filters: QueryFilter[]): PlainObject[] {
  return rows.filter((row) => {
    for (const filter of filters) {
      const val = row[filter.column];
      if (filter.op === "eq" && val !== filter.value) return false;
      if (filter.op === "neq" && val === filter.value) return false;
      if (filter.op === "gte" && !(val >= filter.value)) return false;
      if (filter.op === "lte" && !(val <= filter.value)) return false;
      if (filter.op === "gt" && !(val > filter.value)) return false;
      if (filter.op === "lt" && !(val < filter.value)) return false;
      if (filter.op === "in") {
        const options = Array.isArray(filter.value) ? filter.value : [];
        if (!options.includes(val)) return false;
      }
      if (filter.op === "not_is") {
        if (filter.value === null && val === null) return false;
        if (val === filter.value) return false;
      }
    }
    return true;
  });
}

function parseOrValue(raw: string): any {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric) && raw.trim() !== "") return numeric;
  return raw;
}

// eslint-disable-next-line unused-imports/no-unused-vars
function applyOrdering(rows: PlainObject[], orderRules: OrderRule[]): PlainObject[] {
  if (orderRules.length === 0) return rows;
  const result = [...rows];
  result.sort((a, b) => {
    for (const rule of orderRules) {
      const av = a[rule.column];
      const bv = b[rule.column];
      if (av === bv) continue;
      if (av == null) return rule.ascending ? -1 : 1;
      if (bv == null) return rule.ascending ? 1 : -1;
      if (av < bv) return rule.ascending ? -1 : 1;
      if (av > bv) return rule.ascending ? 1 : -1;
    }
    return 0;
  });
  return result;
}

async function fetchInChunks(collectionName: string, field: string, values: string[]): Promise<PlainObject[]> {
  if (values.length === 0) return [];
  const uniqueValues = [...new Set(values)];
  const chunks = [];
  for (let i = 0; i < uniqueValues.length; i += 30) {
    chunks.push(uniqueValues.slice(i, i + 30));
  }
  
  const results: PlainObject[] = [];
  const collRef = collection(firebaseDb, collectionName);
  
  for (const chunk of chunks) {
    const q = query(collRef, where(field === "__name__" ? documentId() : field, "in", chunk));
    const snap = await getDocs(q);
    results.push(...snap.docs.map(d => withDocId(d.data() as PlainObject, d.id)));
  }
  return results;
}

async function enrichRelations(rows: PlainObject[], table: string, parsedSelect: ParsedSelect): Promise<PlainObject[]> {
  if (parsedSelect.relations.length === 0 || rows.length === 0) return rows;

  const relatedData = new Map<string, PlainObject[]>();
  
  for (const rel of parsedSelect.relations) {
    const relatedTable = rel.relation;
    let sourceKey: string | null = null;
    let fetchedRows: PlainObject[] = [];

    if (table === "tasks" && rel.alias === "creator") sourceKey = "creator_id";
    if (table === "tasks" && rel.alias === "assignee") sourceKey = "assignee_id";
    if (table === "teams" && rel.alias === "manager") sourceKey = "manager_id";
    if (table === "job_applications" && rel.relation === "job_positions") sourceKey = "job_id";
    if (!sourceKey && rel.relation === "user_subscriptions") sourceKey = "user_id";

    if (table === "teams" && rel.relation === "team_members") {
      const teamIds = [...new Set(rows.map(r => String(r.id || "")))].filter(Boolean);
      fetchedRows = await fetchInChunks(relatedTable, "team_id", teamIds);
      
      const workerField = rel.fields.find((f) => f.includes("user_subscriptions") || f.startsWith("worker:"));
      if (workerField) {
         const userIds = [...new Set(fetchedRows.map(m => String(m.user_id || "")))].filter(Boolean);
         const workerRows = await fetchInChunks("user_subscriptions", "user_id", userIds);
         const existingWorkerRows = relatedData.get("user_subscriptions") || [];
         relatedData.set("user_subscriptions", [...existingWorkerRows, ...workerRows]);
      }
    } else if (sourceKey) {
      const targetIds = [...new Set(rows.map(r => String(r[sourceKey!] || "")))].filter(Boolean);
      const targetField = relatedTable === "user_subscriptions" ? "user_id" : "__name__";
      fetchedRows = await fetchInChunks(relatedTable, targetField, targetIds);
    } else {
      console.warn(`Unknown relation mapping for table ${table} -> ${relatedTable}. Fetching all.`);
      fetchedRows = await loadCollectionRows(relatedTable);
    }

    const existing = relatedData.get(relatedTable) || [];
    relatedData.set(relatedTable, [...existing, ...fetchedRows]);
  }

  return rows.map((row) => {
    const next = { ...row };
    for (const rel of parsedSelect.relations) {
      const targetRows = relatedData.get(rel.relation) || [];
      let sourceKey: string | null = null;

      if (table === "tasks" && rel.alias === "creator") sourceKey = "creator_id";
      if (table === "tasks" && rel.alias === "assignee") sourceKey = "assignee_id";
      // internal_messages handling removed: chat is not stored in Firestore
      if (table === "teams" && rel.alias === "manager") sourceKey = "manager_id";
      if (table === "job_applications" && rel.relation === "job_positions") sourceKey = "job_id";
      if (!sourceKey && rel.relation === "user_subscriptions") sourceKey = "user_id";

      if (table === "teams" && rel.relation === "team_members") {
        const teamMembers = targetRows.filter((member) => String(member.team_id || "") === String(row.id || ""));
        const workerField = rel.fields.find((f) => f.includes("user_subscriptions") || f.startsWith("worker:"));
        let workerFields: string[] = [];
        if (workerField) {
          const parsedWorker = parseRelationToken(workerField);
          workerFields = parsedWorker?.fields || [];
        }

        const workerRows = relatedData.get("user_subscriptions") || [];
        const mappedMembers = teamMembers.map((member) => {
          if (!workerField) return member;

          const matchedWorker = workerRows.find((item) => String(item.user_id || item.id || "") === String(member.user_id || "")) || null;
          if (!matchedWorker) {
            return { ...member, worker: null };
          }

          if (workerFields.length === 0 || workerFields.includes("*")) {
            return { ...member, worker: matchedWorker };
          }

          const pickedWorker: PlainObject = {};
          for (const field of workerFields) {
            pickedWorker[field] = matchedWorker[field] ?? null;
          }
          return { ...member, worker: pickedWorker };
        });

        next[rel.alias] = mappedMembers;
        continue;
      }

      const sourceValue = sourceKey ? row[sourceKey] : undefined;
      const related = targetRows.find((item) => {
        if (rel.relation === "user_subscriptions") {
          return item.user_id === sourceValue || item.id === sourceValue;
        }
        return item.id === sourceValue;
      }) || null;

      if (!related) {
        next[rel.alias] = null;
      } else if (rel.fields.length === 0 || rel.fields.includes("*")) {
        next[rel.alias] = related;
      } else {
        const picked: PlainObject = {};
        for (const field of rel.fields) {
          picked[field] = related[field] ?? null;
        }
        next[rel.alias] = picked;
      }
    }
    return next;
  });
}

function projectRow(row: PlainObject, parsedSelect: ParsedSelect): PlainObject {
  if (parsedSelect.includeAll && parsedSelect.relations.length === 0 && parsedSelect.scalarFields.length === 0) {
    return row;
  }

  const out: PlainObject = parsedSelect.includeAll ? { ...row } : {};
  for (const key of parsedSelect.scalarFields) {
    out[key] = row[key] ?? null;
  }
  for (const rel of parsedSelect.relations) {
    out[rel.alias] = row[rel.alias] ?? null;
  }
  return out;
}

class CompatTableQuery implements PromiseLike<CompatResult<any>> {
  private readonly table: string;
  private readonly filters: QueryFilter[] = [];
  private readonly orPredicates: Array<(row: PlainObject) => boolean> = [];
  private readonly orderRules: OrderRule[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private selectClause = "*";
  private selectOptions: SelectOptions = {};
  private expectSingle = false;
  private allowZeroRows = false;

  private mutationType: "insert" | "update" | "upsert" | "delete" | null = null;
  private mutationPayload: any = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", options?: SelectOptions) {
    this.selectClause = columns;
    this.selectOptions = options || {};
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ op: "neq", column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ op: "in", column, value: values });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ op: "lte", column, value });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({ op: "gt", column, value });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ op: "lt", column, value });
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator === "is") {
      this.filters.push({ op: "not_is", column, value });
    }
    return this;
  }

  or(expression: string) {
    const terms = splitTopLevelCsv(expression).map((part) => part.trim()).filter(Boolean);
    if (terms.length === 0) return this;

    const termPredicates = terms.map((term) => {
      const inMatch = term.match(/^([A-Za-z0-9_]+)\.in\.\((.*)\)$/);
      if (inMatch) {
        const column = inMatch[1];
        const values = splitTopLevelCsv(inMatch[2]).map((v) => v.trim()).filter(Boolean).map(parseOrValue);
        return (row: PlainObject) => values.includes(row[column]);
      }

      const match = term.match(/^([A-Za-z0-9_]+)\.(eq|is|ilike)\.(.+)$/);
      if (!match) {
        return () => false;
      }

      const column = match[1];
      const operator = match[2];
      const rawValue = match[3];

      if (operator === "eq") {
        const expected = parseOrValue(rawValue);
        return (row: PlainObject) => row[column] === expected;
      }

      if (operator === "is") {
        const expected = parseOrValue(rawValue);
        return (row: PlainObject) => row[column] === expected;
      }

      if (operator === "ilike") {
        const normalizedNeedle = rawValue.replace(/%/g, "").toLowerCase();
        return (row: PlainObject) => {
          const val = String(row[column] ?? "").toLowerCase();
          return val.includes(normalizedNeedle);
        };
      }

      return () => false;
    });

    this.orPredicates.push((row: PlainObject) => termPredicates.some((fn) => fn(row)));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderRules.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(value: number) {
    this.limitCount = value;
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = Math.max(0, Number(from) || 0);
    this.rangeTo = Math.max(this.rangeFrom, Number(to) || this.rangeFrom);
    return this;
  }

  maybeSingle() {
    this.expectSingle = true;
    this.allowZeroRows = true;
    return this;
  }

  single() {
    this.expectSingle = true;
    this.allowZeroRows = false;
    return this;
  }

  insert(payload: any) {
    this.mutationType = "insert";
    this.mutationPayload = payload;
    return this;
  }

  update(payload: any) {
    this.mutationType = "update";
    this.mutationPayload = payload;
    return this;
  }

  upsert(payload: any) {
    this.mutationType = "upsert";
    this.mutationPayload = payload;
    return this;
  }

  delete() {
    this.mutationType = "delete";
    this.mutationPayload = null;
    return this;
  }

  private async executeRead(): Promise<CompatResult<any>> {
    try {
      const collectionRef = collection(firebaseDb, this.table);
      const constraints: QueryConstraint[] = [];

      // Translate basic filters to where() clauses
      for (const filter of this.filters) {
        if (filter.op === "eq") constraints.push(where(filter.column, "==", filter.value));
        else if (filter.op === "neq") constraints.push(where(filter.column, "!=", filter.value));
        else if (filter.op === "gte") constraints.push(where(filter.column, ">=", filter.value));
        else if (filter.op === "lte") constraints.push(where(filter.column, "<=", filter.value));
        else if (filter.op === "gt") constraints.push(where(filter.column, ">", filter.value));
        else if (filter.op === "lt") constraints.push(where(filter.column, "<", filter.value));
        else if (filter.op === "in") constraints.push(where(filter.column, "in", filter.value));
        // 'not_is null' is tricky in Firestore, skipped for now to avoid complexity
      }

      // Translate ordering
      for (const rule of this.orderRules) {
        constraints.push(orderBy(rule.column, rule.ascending ? "asc" : "desc"));
      }

      // Translate limit (only if no range is specified, to avoid cutting off pagination)
      if (this.limitCount != null && this.rangeFrom === null) {
        constraints.push(limit(this.limitCount));
      }

      const q = query(collectionRef, ...constraints);

      // Fast path for count-only queries without in-memory filters
      if (this.selectOptions.head && this.orPredicates.length === 0) {
        const countSnap = await getCountFromServer(q);
        return {
          data: null,
          error: null,
          count: this.selectOptions.count === "exact" ? countSnap.data().count : null,
        };
      }

      const snap = await getDocs(q);
      let results = snap.docs.map((d) => withDocId(d.data() as PlainObject, d.id));

      // In-memory post-processing for complex 'or' predicates if needed
      // (Native Firestore 'or' is available in newer SDKs but this ensures compatibility)
      if (this.orPredicates.length > 0) {
        results = results.filter((row) => this.orPredicates.every((predicate) => predicate(row)));
      }

      const count = results.length;

      // In-memory pagination
      if (this.rangeFrom !== null && this.rangeTo !== null) {
        results = results.slice(this.rangeFrom, this.rangeTo + 1);
      } else if (this.limitCount != null && this.rangeFrom !== null) {
        // If someone specifies limit AND range, apply limit after range
        results = results.slice(0, this.limitCount);
      }

      if (this.selectOptions.head) {
        return {
          data: null,
          error: null,
          count: this.selectOptions.count === "exact" ? count : null,
        };
      }

      const parsedSelect = parseSelect(this.selectClause);
      const enriched = await enrichRelations(results, this.table, parsedSelect);
      const projected = enriched.map((row) => projectRow(row, parsedSelect));

      if (this.expectSingle) {
        if (projected.length === 0) {
          return {
            data: null,
            error: this.allowZeroRows ? null : new Error("No rows found"),
            count: this.selectOptions.count === "exact" ? count : null,
          };
        }
        return {
          data: projected[0],
          error: null,
          count: this.selectOptions.count === "exact" ? count : null,
        };
      }

      return {
        data: projected,
        error: null,
        count: this.selectOptions.count === "exact" ? count : null,
      };
    } catch (error: any) {
      return { data: null, error, count: null };
    }
  }

  private async executeInsert(): Promise<CompatResult<any>> {
    const rows = Array.isArray(this.mutationPayload) ? this.mutationPayload : [this.mutationPayload];
    const inserted: PlainObject[] = [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      if (row.id) {
        await setDoc(doc(firebaseDb, this.table, String(row.id)), row, { merge: true });
        inserted.push({ ...row, id: String(row.id) });
      } else {
        const created = await addDoc(collection(firebaseDb, this.table), row);
        inserted.push({ ...row, id: created.id });
      }
    }

    return { data: inserted, error: null, count: null };
  }

  private async executeUpdate(): Promise<CompatResult<any>> {
    try {
      const collectionRef = collection(firebaseDb, this.table);
      const constraints: QueryConstraint[] = [];

      for (const filter of this.filters) {
        if (filter.op === "eq") constraints.push(where(filter.column, "==", filter.value));
        else if (filter.op === "neq") constraints.push(where(filter.column, "!=", filter.value));
        else if (filter.op === "gte") constraints.push(where(filter.column, ">=", filter.value));
        else if (filter.op === "lte") constraints.push(where(filter.column, "<=", filter.value));
        else if (filter.op === "gt") constraints.push(where(filter.column, ">", filter.value));
        else if (filter.op === "lt") constraints.push(where(filter.column, "<", filter.value));
        else if (filter.op === "in") constraints.push(where(filter.column, "in", filter.value));
      }

      const q = query(collectionRef, ...constraints);
      const snap = await getDocs(q);
      const updated: PlainObject[] = [];

      for (const d of snap.docs) {
        await updateDoc(doc(firebaseDb, this.table, d.id), this.mutationPayload || {});
        updated.push(withDocId(d.data() as PlainObject, d.id));
      }

      return { data: updated, error: null, count: null };
    } catch (error: any) {
      return { data: null, error, count: null };
    }
  }

  private async executeDelete(): Promise<CompatResult<any>> {
    try {
      const collectionRef = collection(firebaseDb, this.table);
      const constraints: QueryConstraint[] = [];

      for (const filter of this.filters) {
        if (filter.op === "eq") constraints.push(where(filter.column, "==", filter.value));
        else if (filter.op === "neq") constraints.push(where(filter.column, "!=", filter.value));
        else if (filter.op === "gte") constraints.push(where(filter.column, ">=", filter.value));
        else if (filter.op === "lte") constraints.push(where(filter.column, "<=", filter.value));
        else if (filter.op === "gt") constraints.push(where(filter.column, ">", filter.value));
        else if (filter.op === "lt") constraints.push(where(filter.column, "<", filter.value));
        else if (filter.op === "in") constraints.push(where(filter.column, "in", filter.value));
      }

      const q = query(collectionRef, ...constraints);
      const snap = await getDocs(q);
      const deleted: PlainObject[] = [];

      for (const d of snap.docs) {
        await deleteDoc(doc(firebaseDb, this.table, d.id));
        deleted.push(withDocId(d.data() as PlainObject, d.id));
      }

      return { data: deleted, error: null, count: null };
    } catch (error: any) {
      return { data: null, error, count: null };
    }
  }

  private async executeUpsert(): Promise<CompatResult<any>> {
    const rows = Array.isArray(this.mutationPayload) ? this.mutationPayload : [this.mutationPayload];
    const written: PlainObject[] = [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;

      let id = row.id ? String(row.id) : "";
      
      // Attempt targeted lookup if user_id is provided but id is not
      if (!id && row.user_id) {
        const q = query(collection(firebaseDb, this.table), where("user_id", "==", row.user_id), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          id = snap.docs[0].id;
        }
      }

      if (id) {
        await setDoc(doc(firebaseDb, this.table, id), row, { merge: true });
        written.push({ ...row, id });
      } else {
        const created = await addDoc(collection(firebaseDb, this.table), row);
        written.push({ ...row, id: created.id });
      }
    }

    return { data: written, error: null, count: null };
  }

  private async executeMutation(): Promise<CompatResult<any>> {
    if (this.mutationType === "insert") return this.executeInsert();
    if (this.mutationType === "update") return this.executeUpdate();
    if (this.mutationType === "upsert") return this.executeUpsert();
    if (this.mutationType === "delete") return this.executeDelete();
    return { data: null, error: new Error("Unsupported mutation"), count: null };
  }

  async execute(): Promise<CompatResult<any>> {
    try {
      if (this.mutationType) {
        return await this.executeMutation();
      }
      return await this.executeRead();
    } catch (error: any) {
      return { data: null, error, count: null };
    }
  }

  then<TResult1 = CompatResult<any>, TResult2 = never>(
    onfulfilled?: ((value: CompatResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }
}

type RealtimeHandler = (payload: { new: PlainObject }) => void;

class CompatChannel {
  private readonly name: string;
  private handlers: RealtimeHandler[] = [];
  private unsubscribe: (() => void) | null = null;
  private table: string | null = null;
  private filterColumn: string | null = null;
  private filterValue: string | null = null;

  constructor(name: string) {
    this.name = name;
  }

  on(
    _event: string,
    config: { event?: string; schema?: string; table?: string; filter?: string },
    callback: RealtimeHandler
  ) {
    this.table = config.table || null;
    this.handlers.push(callback);

    const rawFilter = config.filter || "";
    const filterMatch = rawFilter.match(/^([A-Za-z0-9_]+)=eq\.(.+)$/);
    if (filterMatch) {
      this.filterColumn = filterMatch[1];
      this.filterValue = filterMatch[2];
    }

    return this;
  }

  subscribe() {
    if (!this.table || this.handlers.length === 0) return this;

    const collectionRef = collection(firebaseDb, this.table);
    this.unsubscribe = onSnapshot(collectionRef, (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        const payload = withDocId(change.doc.data() as PlainObject, change.doc.id);
        if (this.filterColumn && this.filterValue != null) {
          if (String(payload[this.filterColumn] ?? "") !== this.filterValue) continue;
        }
        for (const handler of this.handlers) {
          handler({ new: payload });
        }
      }
    });

    return this;
  }

  close() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

async function invokeEdgeFunction(functionName: string, body?: unknown) {
  try {
    const baseUrl = normalizeEdgeBaseUrl();
    if (!baseUrl) {
      throw new Error("Missing backend function base URL configuration");
    }

    const {
      data: { session },
    } = await authClient.auth.getSession();

    const response = await fetch(`${baseUrl}/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        data: null,
        error: new Error(String((payload as PlainObject)?.error || (payload as PlainObject)?.message || `Function ${functionName} failed`)),
      };
    }

    return { data: payload, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

async function callRpc(functionName: string, args: PlainObject) {
  if (functionName !== "set_user_subscription_plan") {
    return { data: null, error: new Error(`Unsupported RPC: ${functionName}`) };
  }

  try {
    const targetUserId = String(args.target_user_id || "");
    if (!targetUserId) throw new Error("Missing target_user_id");

    const tier = String(args.new_tier || "free");
    const durationDays = Math.max(1, Number(args.duration_days || 30));
    const autoRenew = Boolean(args.enable_auto_renew);

    const now = new Date();
    const expires = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const updates = {
      tier,
      auto_renew: autoRenew,
      plan_duration_days: durationDays,
      subscription_started_at: now.toISOString(),
      subscription_expires_at: expires.toISOString(),
      subscription_active: tier !== "free",
      updated_at: now.toISOString(),
    };

    await setDoc(doc(firebaseDb, "user_subscriptions", targetUserId), {
      user_id: targetUserId,
      ...updates,
    }, { merge: true });

    return { data: { success: true }, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export const dbClient = {
  from(table: string) {
    return new CompatTableQuery(table);
  },

  auth: authClient.auth,

  functions: {
    async invoke(functionName: string, options?: { body?: unknown }) {
      return invokeEdgeFunction(functionName, options?.body);
    },
  },

  async rpc(functionName: string, args: PlainObject) {
    return callRpc(functionName, args || {});
  },

  channel(name: string) {
    return new CompatChannel(name);
  },

  removeChannel(channel: CompatChannel) {
    channel.close();
  },
};
