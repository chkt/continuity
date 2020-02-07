import { createDeferred, Deferred } from "./deferred";
import { getSequencerSettings, SequencerConfig } from "./settings";
import { advanceIndex, getOffset } from "./loop";
import { createQueueItem, split, insert, QueueItems, scheduleProcessing } from "./queue";
import { createScheduleResult, result_type, ScheduleResult } from "./schedule";


type settle<T> = (val:T) => Promise<T>;

export interface Sequencer {
	register() : number;
	resolve(id:number) : Promise<ScheduleResult>;
	immediate() : Promise<ScheduleResult>;
	align<T>() : settle<T>;
	assign<T>(p:Promise<T>) : Promise<T>;
}


export function createSequencer(config?:SequencerConfig) : Sequencer {
	const settings = getSequencerSettings(config);

	let next = settings.next;
	let last = settings.next;
	let queue:QueueItems = [];
	let scheduled = 0;

	return {
		register() : number {
			const res = next;

			next = advanceIndex(next);

			return res;
		},
		resolve(id:number) : Promise<ScheduleResult> {
			const offset = getOffset(last, id);

			if (offset < 0 || getOffset(next, id) >= 0) {
				if (scheduled === 0) return Promise.resolve(createScheduleResult(id, result_type.late));
				else return Promise.resolve(createScheduleResult(id, result_type.late)).then(res => res);
			}
			else if (offset === 0 && queue.length === 0 && scheduled === 0) {
				last = advanceIndex(last);

				return Promise.resolve(createScheduleResult(id, result_type.immediate));
			}
			else {
				const deferred:Deferred<ScheduleResult, void> = createDeferred();
				const pieces = split(
					insert(queue, createQueueItem(id, deferred.resolve)),
					last,
					settings
				);

				queue = pieces.partial;
				last = advanceIndex(last, pieces.numIds);
				scheduled += pieces.sequential.length;

				scheduleProcessing(pieces.sequential).then(num => { scheduled -= num; });

				return deferred.promise;
			}
		},
		immediate(this:Sequencer) : Promise<ScheduleResult> {
			return this.resolve(this.register());
		},
		align<T>(this:Sequencer) : settle<T> {
			const id = this.register();

			return val => this.resolve(id).then(() => val);
		},
		assign<T>(this:Sequencer, p:Promise<T>) : Promise<T> {
			return p.then(this.align());
		}
	};
}
