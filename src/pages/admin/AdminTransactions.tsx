import { useState, useEffect } from "react";
import { CreditCard, Search, ArrowDownToLine, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dbClient } from "@/integrations/firebase/client";
import { toast } from "sonner";

interface Transaction {
  id: string;
  provider_transaction_id: string | null;
  amount: number;
  currency: string;
  status: string;
  provider: string | null;
  created_at: string;
  user_subscriptions: {
    full_name: string;
    email: string | null;
  } | null;
}

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const { data, error } = await dbClient
          .from("transactions")
          .select(`
            *,
            user_subscriptions(full_name, email)
          `)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setTransactions((data as unknown as Transaction[]) || []);
      } catch (err) {
        toast.error("Failed to load transactions");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  const filteredTransactions = transactions.filter(tx => 
    (tx.provider_transaction_id?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (tx.user_subscriptions?.full_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (tx.user_subscriptions?.email?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="outline" className="text-green-500 border-green-500/30 gap-1"><CheckCircle2 className="w-3 h-3"/> Completed</Badge>;
      case 'failed': return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3"/> Failed</Badge>;
      case 'refunded': return <Badge variant="secondary">Refunded</Badge>;
      default: return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Payments Log</h2>
          <p className="text-muted-foreground mt-1">Audit trail of all system transactions.</p>
        </div>
        <Button variant="outline" className="gap-2">
          <ArrowDownToLine className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Transaction Ledger
            </CardTitle>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search by ID, Name or Email..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-lg">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-lg">Transaction ID</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading ledger...</td></tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No transactions found.</td></tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {tx.provider_transaction_id || tx.id.slice(0, 8) + '...'}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex flex-col">
                          <span>{tx.user_subscriptions?.full_name || "Unknown"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold">
                        ${Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-muted-foreground">{tx.provider || "System"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(tx.status)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
