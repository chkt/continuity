export function advanceIndex(base:number, increment:number = 1) : number {
	return base + increment < Number.MAX_SAFE_INTEGER ?
		base + increment :
		base - Number.MAX_SAFE_INTEGER + increment;
}

export function getOffset(base:number, relative:number) : number {
	const d = relative - base, v = Math.abs(d);
	const w = Number.MAX_SAFE_INTEGER - v;

	return v < w ? d : w * Math.sign(-d);
}
