export type Car = {
  id: string; client_id?: string; name: string; year: number; series: string;
  number: string; color: string; quantity: number; condition: string;
  favorite: boolean; notes: string; photo: string;
};
export type Session = { token: string; user: { id: number; username: string } };
