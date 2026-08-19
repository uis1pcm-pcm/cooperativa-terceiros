import type { D1Database } from "./types";
import { firstWithMetrics } from "./metrics";
export type ServiceStats={id:1;total:number;open:number;pending:number;concluded:number;updated_at:number};
export class StatsRepository { constructor(private readonly db:D1Database){} get(){return firstWithMetrics<ServiceStats>("stats.get",this.db.prepare("SELECT id,total,open,pending,concluded,updated_at FROM service_stats WHERE id=1 LIMIT 1"));} }
