import { QueueOptions } from "./queue";


export interface SequencerConfig extends Partial<QueueOptions> {
	readonly firstId? : number;
}

interface SequencerSettings extends Required<SequencerConfig> {}


function createDefaultSettings() : SequencerSettings {
	return {
		// tslint:disable-next-line:object-literal-sort-keys
		firstId : 0,
		maxRatio : Number.POSITIVE_INFINITY,
		maxDelay : Number.POSITIVE_INFINITY
	};
}

function normalizeSettings(settings:SequencerSettings) : SequencerSettings {
	return {
		// tslint:disable-next-line:object-literal-sort-keys
		firstId : Math.max(settings.firstId % Number.MAX_SAFE_INTEGER, 0),
		maxRatio : Math.max(settings.maxRatio, 0),
		maxDelay : Math.max(settings.maxDelay, 0)
	};
}


export function getSequencerSettings(config?:SequencerConfig) : SequencerSettings {
	return normalizeSettings({
		...createDefaultSettings(),
		...config
	});
}
