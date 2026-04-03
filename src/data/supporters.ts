import supportersData from './supporters.json';

export interface Supporter {
  id: string;
  name: string;
  amount: number;
}

export const supporters = supportersData as Supporter[];
