[![Tests](https://github.com/chkt/continuity/workflows/tests/badge.svg)](https://github.com/chkt/continuity/actions)
[![Version](https://img.shields.io/npm/v/@chkt/continuity)](https://www.npmjs.com/package/@chkt/continuity)
![Node](https://img.shields.io/node/v/@chkt/continuity)
![Dependencies](https://img.shields.io/librariesio/release/npm/@chkt/continuity)
![Licence](https://img.shields.io/npm/l/@chkt/continuity)
![Language](https://img.shields.io/github/languages/top/chkt/continuity)
![Size](https://img.shields.io/bundlephobia/min/@chkt/onceupon)

# Continuity
Sequentially aligned promise resolution

## Install

```sh
npm install @chkt/continuity
```

## Use

In this example we create three promises, each immediately resolving to the values `1`, `2` and `3`.
Then the processing of each promise becomes blocked for a random amount of time by calling `randomTimeout()`.
Afterwards The execution of subsequent `.then()` calls is being realigned
to correspond the the order in which their calls to `sequencer.align()` were made.


```typescript
import * as assert from 'assert';
import { createSequencer } from '@chkt/continuity';

function randomTimeout(val:number) : Promise<number> {
  return new Promise(resolve => {
    setTimeout(
      resolve.bind(null, val), 
      Math.floor(Math.random() * 1000)
    );
  });
}

const sequencer = createSequencer();
const result:number[] = [];

const promises = [ 
  Promise.resolve(1), 
  Promise.resolve(2), 
  Promise.resolve(3) 
];

const resolved = promises.map(promise => promise
  .then(randomTimeout)
  .then(sequencer.align())
  .then(val => result.push(val))
);

Promise.all(resolved).then(() => {
  assert.deepStrictEqual(result, [ 1, 2, 3 ]);
});
```

## Api
```typescript
interface SequencerConfig {
  readonly next : number;
}

enum result_type { immediate, late, queued }

interface ScheduleResult {
  readonly id : number;
  readonly type : result_type;
}

interface Sequencer {
  register() : number; // get a sequential id
  schedule(id:number) : Promise<ScheduleResult>; // schedule a registered id for processing
  immediate() : Promise<ScheduleResult>; // shorthand for sequencer.schedule(sequencer.register())
  align<T>() : (val:T) => Promise<T>; // get a trigger function for scheduling
  assign<T>(p:Promise<T>) : Promise<T>; // shorthand for promise.then(sequencer.align())
}

type createSequencer = (config:SequencerConfig) => Sequencer;
```
