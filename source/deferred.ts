export type resolve<T> = (value:T) => void;
export type reject<E> = (reason:E) => void;

export interface Deferred<T, E> {
	readonly promise : Promise<T>;
	readonly resolve : resolve<T>;
	readonly reject : reject<E>;
}


const noop = () => undefined;


export function createDeferred<T, E>() {
	let resolve:resolve<T> = noop, reject:reject<E> = noop;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}
