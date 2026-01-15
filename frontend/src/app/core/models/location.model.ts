export interface Location {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
}

export interface LocationCreate {
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radius_meters?: number;
}

export interface LocationUpdate {
  name?: string;
  address?: string | null;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  is_active?: boolean;
}
