export interface SequencerConfig {
	readonly next? : number;
}

interface SequencerSettings extends Required<SequencerConfig> {}


function createDefaultSettings() : SequencerSettings {
	return { next : 0 };
}

function normalizeSettings(settings:SequencerSettings) : SequencerSettings {
	return {
		next : Math.max(settings.next % Number.MAX_SAFE_INTEGER, 0)
	};
}


export function getSequencerSettings(config?:SequencerConfig) : SequencerSettings {
	return normalizeSettings({
		...createDefaultSettings(),
		...config
	});
}
