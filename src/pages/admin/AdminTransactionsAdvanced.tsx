import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Download,
  RefreshCw,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dbClient } from "@/integrations/firebase/client";
import { toast } from "sonner";

interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  status: "pending" | "completed" | "failed" | "refunded";
  provider?: string | null;
  provider_transaction_id?: string | null;
  payment_method?: string | null;
  description?: string | null;
  refund_reason?: string | null;
  refunded_amount?: number | null;
  refunded_at?: string | null;
  invoice_url?: string | null;
  created_at: string;
}

interface StatCard {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  color: string;
}

export function AdminTransactionsAdvanced() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(
    null
  );
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    transactionCount: 0,
    averageTransaction: 0,
    refundedAmount: 0,
  });

  useEffect(() => {
    fetchTransactions();
    fetchStats();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await dbClient
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setTransactions((data || []) as any);
    } catch (err: any) {
      console.error("Failed to fetch transactions:", err);
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await dbClient
        .from("transactions")
        .select("amount, refunded_amount, status");

      if (error) throw error;

      const totalRevenue = (data || []).reduce((sum, t) => sum + (t.amount || 0), 0);
      const refundedAmount = (data || []).reduce(
        (sum, t) => sum + (t.refunded_amount || 0),
        0
      );

      setStats({
        totalRevenue,
        transactionCount: data?.length || 0,
        averageTransaction: data && data.length > 0 ? totalRevenue / data.length : 0,
        refundedAmount,
      });
    } catch (err: any) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const handleRefund = async () => {
    if (!selectedTransaction || !refundAmount || !refundReason.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await dbClient
        .from("transactions")
        .update({
          status: "refunded",
          refund_reason: refundReason,
          refunded_amount: Number(refundAmount),
          refunded_at: new Date().toISOString(),
        })
        .eq("id", selectedTransaction.id);

      if (error) throw error;

      toast.success("Refund processed successfully");
      setShowRefundDialog(false);
      setRefundAmount("");
      setRefundReason("");
      fetchTransactions();
      fetchStats();
    } catch (err: any) {
      console.error("Failed to process refund:", err);
      toast.error("Failed to process refund");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportCSV = () => {
    const filtered = filterTransactions();
    const csv = [
      [
        "Date",
        "User ID",
        "Amount",
        "Status",
        "Provider",
        "Payment Method",
        "Refunded Amount",
        "Description",
      ],
      ...filtered.map((t) => [
        new Date(t.created_at).toLocaleDateString(),
        t.user_id,
        `$${t.amount.toFixed(2)}`,
        t.status,
        t.provider || "N/A",
        t.payment_method || "N/A",
        t.refunded_amount ? `$${t.refunded_amount.toFixed(2)}` : "N/A",
        t.description || "N/A",
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Transactions exported successfully");
  };

  const filterTransactions = () => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.id.includes(searchTerm) ||
        t.user_id.includes(searchTerm) ||
        (t.provider ?? "").includes(searchTerm) ||
        (t.description ?? "").includes(searchTerm);
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesDate =
        (!dateFrom || new Date(t.created_at) >= new Date(dateFrom)) &&
        (!dateTo || new Date(t.created_at) <= new Date(dateTo));
      return matchesSearch && matchesStatus && matchesDate;
    });
  };

  const statCards: StatCard[] = [
    {
      label: "Total Revenue",
      value: `$${stats.totalRevenue.toFixed(2)}`,
      subtext: "All time",
      icon: <DollarSign className="w-6 h-6" />,
      color: "from-blue-500/20 to-blue-600/20",
    },
    {
      label: "Transactions",
      value: stats.transactionCount.toString(),
      subtext: "Total count",
      icon: <TrendingUp className="w-6 h-6" />,
      color: "from-green-500/20 to-green-600/20",
    },
    {
      label: "Average",
      value: `$${stats.averageTransaction.toFixed(2)}`,
      subtext: "Per transaction",
      icon: <ArrowUpRight className="w-6 h-6" />,
      color: "from-purple-500/20 to-purple-600/20",
    },
    {
      label: "Refunds",
      value: `-$${stats.refundedAmount.toFixed(2)}`,
      subtext: "Total refunded",
      icon: <ArrowDownLeft className="w-6 h-6" />,
      color: "from-red-500/20 to-red-600/20",
    },
  ];

  const filteredTransactions = filterTransactions();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Transaction Management</h1>
        <p className="text-muted-foreground mt-1">View and manage all transactions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`bg-gradient-to-br ${stat.color} border border-border rounded-lg p-4`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtext}</p>
              </div>
              <div className="text-primary opacity-20">{stat.icon}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, user, provider, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>

        {/* Date From */}
        <div>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From date"
          />
        </div>

        {/* Date To */}
        <div>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To date"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={fetchTransactions}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={loading || filteredTransactions.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Transactions Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-border rounded-lg overflow-hidden"
      >
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No transactions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">
                    Transaction ID
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">User</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Method</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTransactions.map((transaction) => (
                  <motion.tr
                    key={transaction.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-secondary/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm">
                      {new Date(transaction.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono">
                      {transaction.id.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4 text-sm">{transaction.user_id.slice(0, 8)}...</td>
                    <td className="px-6 py-4 text-sm font-semibold">
                      ${transaction.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {transaction.payment_method || transaction.provider || "Unknown"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          transaction.status === "completed"
                            ? "bg-green-500/20 text-green-700"
                            : transaction.status === "refunded"
                              ? "bg-blue-500/20 text-blue-700"
                              : "bg-yellow-500/20 text-yellow-700"
                        }`}
                      >
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {transaction.status === "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedTransaction(transaction);
                            setShowRefundDialog(true);
                          }}
                        >
                          Refund
                        </Button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Refund Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Transaction: {selectedTransaction?.id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Refund Amount ($)
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                step="0.01"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Original: ${selectedTransaction?.amount || 0}
              </p>
              {selectedTransaction?.description ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedTransaction.description}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Reason</label>
              <Input
                placeholder="Reason for refund"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowRefundDialog(false);
                setRefundAmount("");
                setRefundReason("");
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRefund}
              disabled={actionLoading || !refundAmount || !refundReason}
            >
              {actionLoading ? "Processing..." : "Process Refund"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
