import { resolve } from "./deferred";
import { getOffset } from "./loop";
import { createScheduleResult, result_type, ScheduleResult } from "./schedule";


interface QueueItem {
	readonly id : number;
	readonly resolve : resolve<ScheduleResult>;
}

export type QueueItems = QueueItem[];

interface FlushResult {
	readonly num : number;
	readonly remain : QueueItems;
	readonly done : Promise<number>;
}


// tslint:disable-next-line:no-shadowed-variable
export function createQueueItem(id:number, resolve:resolve<ScheduleResult>) : QueueItem {
	return { id, resolve };
}

function createFlushResult(num:number, remain:QueueItems, done:Promise<number>) : FlushResult {
	return { num, remain, done };
}


export function insert(queue:QueueItems, item:QueueItem) : QueueItems {
	let index = 0;

	for (let i = queue.length - 1; i > -1; i -= 1) {
		if (getOffset(queue[i].id, item.id) > 0) {
			index = i + 1;

			break;
		}
	}

	return queue
		.slice(0, index)
		.concat(item, queue.slice(index));
}

function process(queue:QueueItems) {
	let num = 0;

	for (const item of queue) {
		item.resolve(createScheduleResult(item.id, result_type.queued));
		num += 1;
	}

	return num;
}

function scheduleProcessing(queue:QueueItems) : Promise<number> {
	return Promise
		.resolve(queue)
		.then(q => process(q));
}

export function flush(queue:QueueItems, first:number) : FlushResult {
	let index = 0;
	let skew = 0;

	for (const item of queue) {
		const o = getOffset(first, item.id);

		if (o === index + skew || o === index + --skew) index += 1;
		else break;
	}

	return createFlushResult(
		index,
		queue.slice(index),
		scheduleProcessing(queue.slice(0, index))
	);
}
