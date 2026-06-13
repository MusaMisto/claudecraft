export type AnimalKind = 'cow' | 'pig' | 'sheep' | 'chicken';
export type ClimateVariant = 'temperate' | 'warm' | 'cold';

export type SheepWoolColor =
  | 'white'
  | 'black'
  | 'gray'
  | 'light_gray'
  | 'brown'
  | 'pink';

export type PassiveMobState =
  | 'idle'
  | 'wandering'
  | 'looking'
  | 'swimming'
  | 'stuck'
  | 'panic';

export interface AnimalSpec {
  width: number;
  height: number;
  length: number;
  walkSpeed: number;
  groupMin: number;
  groupMax: number;
}

export const ANIMAL_SPECS: Record<AnimalKind, AnimalSpec> = {
  cow: {
    width: 0.9,
    height: 1.3,
    length: 1.4,
    walkSpeed: 1.2,
    groupMin: 2,
    groupMax: 4,
  },
  pig: {
    width: 0.9,
    height: 0.9,
    length: 1.1,
    walkSpeed: 1.3,
    groupMin: 2,
    groupMax: 4,
  },
  sheep: {
    width: 0.9,
    height: 1.1,
    length: 1.2,
    walkSpeed: 1.15,
    groupMin: 2,
    groupMax: 4,
  },
  chicken: {
    width: 0.4,
    height: 0.7,
    length: 0.4,
    walkSpeed: 0.95,
    groupMin: 2,
    groupMax: 5,
  },
};
