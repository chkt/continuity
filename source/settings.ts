import { QueueOptions } from "./queue";


export interface SequencerConfig extends Partial<QueueOptions> {
	readonly next? : number;
}

interface SequencerSettings extends Required<SequencerConfig> {}


function createDefaultSettings() : SequencerSettings {
	// tslint:disable-next-line:object-literal-sort-keys
	return {
		next : 0,
		maxBlocked : Number.POSITIVE_INFINITY,
		maxDelay : Number.POSITIVE_INFINITY
	};
}

function normalizeSettings(settings:SequencerSettings) : SequencerSettings {
	return {
		// tslint:disable-next-line:object-literal-sort-keys
		next : Math.max(settings.next % Number.MAX_SAFE_INTEGER, 0),
		maxBlocked : Math.max(settings.maxBlocked, 0),
		maxDelay : Math.max(settings.maxDelay, 0)
	};
}


export function getSequencerSettings(config?:SequencerConfig) : SequencerSettings {
	return normalizeSettings({
		...createDefaultSettings(),
		...config
	});
}
