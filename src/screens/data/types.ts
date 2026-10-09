import type { Role } from '../../types';

export type DataStackParams = {
  DataHome: undefined;
  SpgDetail: { id: string };
  AccountForm: { role: Role };
  VenueForm: { id?: string };
  CampaignForm: { id?: string };
};
