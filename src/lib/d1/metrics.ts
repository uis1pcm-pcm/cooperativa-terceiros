import type { D1PreparedStatement, D1Result } from "./types";
type Meta={rows_read?:number;rows_written?:number;duration?:number};
export function logD1Metrics(name:string,result:D1Result<unknown>,returned?:number){if(process.env.D1_DEBUG_METRICS!=="true")return;const meta=result.meta as Meta|undefined;if(!meta)return;console.info(`[D1] ${name} returned=${returned??result.results?.length??0} rows_read=${meta.rows_read??"n/a"} rows_written=${meta.rows_written??"n/a"} duration=${meta.duration??"n/a"}`);}

export async function allWithMetrics<T>(name: string, statement: D1PreparedStatement) {
  const result = await statement.all<T>();
  logD1Metrics(name, result, result.results?.length ?? 0);
  return result.results ?? [];
}

export async function firstWithMetrics<T>(name: string, statement: D1PreparedStatement) {
  const rows = await allWithMetrics<T>(name, statement);
  return rows[0] ?? null;
}
