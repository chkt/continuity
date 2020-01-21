type result_type_raw = 0 | 1 | 2;

export interface ScheduleResult {
	readonly id : number;
	readonly type : result_type_raw;
}


export function createScheduleResult(id:number, type:result_type_raw) : ScheduleResult {
	return { id, type };
}


export const enum result_type {
	immediate = 0,
	late = 1,
	queued = 2
}
