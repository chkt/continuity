import { resolve } from "./deferred";
import { getOffset } from "./loop";
import { createScheduleResult, result_type, ScheduleResult } from "./schedule";


export interface QueueOptions {
	readonly maxBlocked : number;
}

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

function process(queue:QueueItems) : number {
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

export function flush(queue:QueueItems, firstId:number, options:QueueOptions) : FlushResult {
	let startOffset = 0;
	let queueIndex = 0;
	let lastId = Number.NaN;
	let skew = 0;

	for (let index = 0, l = queue.length; index < l; index += 1) {
		const item = queue[index];
		const itemOffset = getOffset(firstId, item.id);

		if (item.id === lastId) {
			if (queueIndex === index) queueIndex += 1;
			else skew -= 1;

			continue;
		}
		else lastId = item.id;

		const totalCount = itemOffset - startOffset + 1;
		const itemCount = index + skew - queueIndex + 1;
		const missingCount = totalCount - itemCount;

		if (missingCount === 0 || itemCount / missingCount > options.maxBlocked) {
			startOffset += totalCount;
			queueIndex = index + 1;
			skew = 0;
		}
	}

	return createFlushResult(
		queueIndex,
		queue.slice(queueIndex),
		scheduleProcessing(queue.slice(0, queueIndex))
	);
}
