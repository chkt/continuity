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

export type QueueItems = ReadonlyArray<QueueItem>;

interface SplitResult {
	readonly numIds : number;
	readonly sequential : QueueItems;
	readonly partial : QueueItems;
}


// tslint:disable-next-line:no-shadowed-variable
export function createQueueItem(id:number, resolve:resolve<ScheduleResult>) : QueueItem {
	return { id, resolve };
}

function createSplitResult(numIds:number, sequential:QueueItems, partial:QueueItems) : SplitResult {
	return { numIds, sequential, partial };
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

export function scheduleProcessing(queue:QueueItems) : Promise<number> {
	return Promise
		.resolve(queue)
		.then(q => process(q));
}

export function split(queue:QueueItems, firstId:number, options:QueueOptions) : SplitResult {
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

	return createSplitResult(
		startOffset,
		queue.slice(0, queueIndex),
		queue.slice(queueIndex)
	);
}
