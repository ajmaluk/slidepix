import { AlertCircle, HelpCircle, MessageSquare, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function ContactMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-foreground transition-colors group px-3 h-10"
        >
          <div className="flex items-center gap-3 w-full">
            <HelpCircle className="w-5 h-5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
            <span className="flex-1 text-left font-medium">Support & Feedback</span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-xl border-border/50">
        <DropdownMenuLabel>How can we help?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem asChild>
          <Link to="/contact" className="cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span>General Question</span>
            </div>
            <ExternalLink className="w-3 h-3 opacity-50" />
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuItem asChild>
          <Link to="/contact" className="cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive/70" />
              <span>Report an Issue</span>
            </div>
            <ExternalLink className="w-3 h-3 opacity-50" />
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        <div className="p-2 text-xs text-muted-foreground text-center">
          Available 24/7 for Enterprise
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
