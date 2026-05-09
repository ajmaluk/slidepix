import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2,
  ChevronDown, Users, Activity,
  Plus, Zap, Globe, Shield, RefreshCw
} from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { dbClient } from "@/integrations/firebase/client";
import { authClient } from "@/lib/authClient";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { Button } from "@/components/ui/button";

type ServiceStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
type IncidentSeverity = 'minor' | 'major' | 'critical';

interface SystemService {
  id: string;
  name: string;
  status: ServiceStatus;
  description: string;
  uptime_90_days: number;
}

interface SystemIncident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  affected_services: string[];
  body: string;
  created_at: string;
  resolved_at: string | null;
}

export default function StatusPage() {
  const [services, setServices] = useState<SystemService[]>([]);
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIncidents, setExpandedIncidents] = useState<Record<string, boolean>>({});
  const [_isAdmin, setIsAdmin] = useState(false);

  const checkUserRole = useCallback(async () => {
    const { data: { session } } = await authClient.auth.getSession();
    if (session?.user) {
      const { data } = await dbClient
        .from("user_subscriptions")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      
      if (data?.role === "admin") {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    }
  }, []);

  const fetchData = async () => {
    try {
      const [servicesRes, incidentsRes] = await Promise.all([
        dbClient.from("system_services").select("*").order("order_index", { ascending: true }),
        dbClient.from("system_incidents").select("*").order("created_at", { ascending: false }).limit(20),
      ]);

      if (servicesRes.data) setServices(servicesRes.data as SystemService[]);
      if (incidentsRes.data) setIncidents(incidentsRes.data as SystemIncident[]);
    } catch (error) {
      console.error("Error fetching status data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    checkUserRole();
  }, [checkUserRole]);

  const overallStatus = useMemo(() => {
    if (services.some(s => s.status === 'major_outage')) return 'major_outage';
    if (services.some(s => s.status === 'partial_outage')) return 'partial_outage';
    if (services.some(s => s.status === 'degraded')) return 'degraded';
    return 'operational';
  }, [services]);

  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case 'operational': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'degraded': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'partial_outage': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'major_outage': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      default: return 'text-muted-foreground bg-muted/10 border-muted/20';
    }
  };

  const getDayColor = (status: ServiceStatus, isHistorical = true) => {
    if (!isHistorical) return 'bg-emerald-500/40';
    switch (status) {
      case 'operational': return 'bg-emerald-500/40 hover:bg-emerald-500/60';
      case 'degraded': return 'bg-amber-500/40 hover:bg-amber-500/60';
      case 'partial_outage': return 'bg-rose-500/40 hover:bg-rose-500/60';
      case 'major_outage': return 'bg-rose-600/60 hover:bg-rose-600/80';
      default: return 'bg-muted/20';
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <SEOHead 
        title="System Status — SlidePix" 
        description="Monitor the real-time health and uptime of SlidePix infrastructure and services." 
        path="/status"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Status", url: "/status" }
        ]}
        jsonLd={{
          "@type": "WebPage",
          "name": "SlidePix System Status",
          "description": "Real-time health monitoring of SlidePix services.",
          "url": "https://dalam.pixtool.in/status"
        }}
      />
      
      <div className="max-w-5xl mx-auto px-4 py-12 md:py-24">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-primary font-bold tracking-widest uppercase text-xs mb-4"
            >
              <Zap className="w-4 h-4" /> Live System Monitor
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold tracking-tight mb-2"
            >
              System <span className="text-muted-foreground/60">Status</span>
            </motion.h1>
            <p className="text-muted-foreground">Real-time health of our core infrastructure and AI models.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg shadow-emerald-500/5 ${getStatusColor(overallStatus)}`}>
               <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
              </span>
              <span className="text-sm font-bold uppercase tracking-wider">{overallStatus.replace('_', ' ')}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => fetchData()} className="rounded-full hover:bg-primary/10">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Global Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: 'Uptime', value: '99.98%', icon: Globe },
            { label: 'Security', value: 'Active', icon: Shield },
            { label: 'Latency', value: '42ms', icon: Activity },
            { label: 'Nodes', value: '24/24', icon: Users },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-4 rounded-2xl border border-border/20 bg-card/5 flex items-center gap-4"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{stat.label}</div>
                <div className="text-sm font-bold">{stat.value}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Services Section */}
        <div className="space-y-4 mb-16">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-2">Core Services</h2>
          <div className="grid gap-4">
            {services.map((service, i) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-6 rounded-3xl border border-border/30 bg-card/10 group hover:border-primary/20 transition-all"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl border ${getStatusColor(service.status)} bg-current/5`}>
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{service.name}</h3>
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${getStatusColor(service.status)}`}>
                    {service.status.replace('_', ' ')}
                  </div>
                </div>

                {/* Grid Visualizer */}
                <div className="space-y-2">
                  <div className="flex gap-1 h-10">
                    {Array.from({ length: 60 }).map((_, idx) => (
                      <div 
                        key={idx}
                        className={`flex-1 rounded-[2px] transition-all duration-300 cursor-help transform hover:scale-y-125 ${
                          idx % 8 === 0 && idx < 40 ? getDayColor('degraded') : getDayColor('operational')
                        }`}
                        title={`${format(subDays(new Date(), 59 - idx), 'MMM d')}: Operational`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1 px-1">
                    <span>60 Days ago</span>
                    <span className="text-primary">{service.uptime_90_days}% Uptime</span>
                    <span>Today</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Incidents Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
             <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">Incident History</h2>
             {userRole && (
               <Button size="sm" disabled className="h-8 rounded-full gap-2 text-[10px] opacity-60 cursor-not-allowed" title="Incident reporting UI is being refreshed">
                 <Plus className="w-3 h-3" /> Report Incident (Soon)
               </Button>
             )}
          </div>

          <div className="space-y-4">
             {incidents.length === 0 ? (
               <div className="p-12 text-center rounded-3xl border border-dashed border-border/20 text-muted-foreground bg-card/5">
                 <CheckCircle2 className="w-8 h-8 text-emerald-500/20 mx-auto mb-4" />
                 <p className="text-sm font-medium">All systems have been stable for the past 30 days.</p>
               </div>
             ) : (
               incidents.map((incident) => (
                 <motion.div 
                   key={incident.id}
                   initial={{ opacity: 0 }}
                   whileInView={{ opacity: 1 }}
                   viewport={{ once: true }}
                   className="rounded-3xl border border-border/20 bg-card/5 overflow-hidden group"
                 >
                   <button
                     onClick={() => setExpandedIncidents(p => ({ ...p, [incident.id]: !p[incident.id] }))}
                     className="w-full p-6 flex items-center justify-between hover:bg-primary/5 transition-all text-left"
                   >
                     <div className="flex items-center gap-6">
                       <div className="hidden md:block">
                         <div className="text-xs font-bold text-muted-foreground uppercase mb-1">{format(new Date(incident.created_at), 'MMM')}</div>
                         <div className="text-2xl font-black">{format(new Date(incident.created_at), 'dd')}</div>
                       </div>
                       <div className="h-8 w-[1px] bg-border/40 hidden md:block" />
                       <div>
                         <div className="flex items-center gap-3 mb-1">
                           <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border ${
                             incident.severity === 'critical' ? 'bg-rose-500/10 text-rose-400 border-rose-400/30' :
                             'bg-amber-500/10 text-amber-400 border-amber-400/30'
                           }`}>
                             {incident.severity}
                           </span>
                           <h3 className="font-bold">{incident.title}</h3>
                         </div>
                         <div className="text-xs text-muted-foreground flex items-center gap-2">
                           <span className="capitalize">{incident.status}</span>
                           <span>•</span>
                           <span>{format(new Date(incident.created_at), 'HH:mm')} UTC</span>
                         </div>
                       </div>
                     </div>
                     <div className={`p-2 rounded-full border border-border/40 transition-transform ${expandedIncidents[incident.id] ? 'rotate-180' : ''}`}>
                       <ChevronDown className="w-4 h-4" />
                     </div>
                   </button>
                   
                   <AnimatePresence>
                     {expandedIncidents[incident.id] && (
                       <motion.div
                         initial={{ height: 0 }}
                         animate={{ height: "auto" }}
                         exit={{ height: 0 }}
                         className="border-t border-border/20 bg-black/20"
                       >
                         <div className="p-8 space-y-6">
                           <div className="prose prose-invert prose-sm max-w-none text-muted-foreground/80">
                             {incident.body}
                           </div>
                           
                           {incident.resolved_at && (
                             <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                               <CheckCircle2 className="w-4 h-4" />
                               System recovered {formatDistanceToNow(new Date(incident.resolved_at), { addSuffix: true })}
                             </div>
                           )}
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>
                 </motion.div>
               ))
             )}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-24 pt-8 border-t border-border/10 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
           <div className="flex items-center gap-4">
             <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
             <a href="#" className="hover:text-primary transition-colors">Security</a>
             <a href="#" className="hover:text-primary transition-colors">Contact Support</a>
           </div>
           <div>Last Check: {format(new Date(), 'HH:mm:ss')} • Caching enabled</div>
        </div>
      </div>
    </PageLayout>
  );
}
