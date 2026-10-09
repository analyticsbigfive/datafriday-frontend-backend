export interface DashboardMetaDto {
  spaceId: string;
  tenantId: string;
  from: string;
  to: string;
  granularity: string;
  filtersHash: string;
  analyticsVersion: number;
  generatedAt: string;
  cache: {
    hit: boolean;
    ttlSeconds: number;
  };
}

export interface SpaceInfoDto {
  id: string;
  name: string;
  timezone: string;
  configs: Array<{
    id: string;
    name: string;
    capacity: number | null;
  }>;
}

interface EventFilterDto {
  id: string;
  name: string;
  startDate: string | null;
}

interface ShopFilterDto {
  spaceElementId: string;
  name: string;
}

interface WeezeventLocationFilterDto {
  weezeventLocationId: string;
  name: string;
}

interface WeezeventMerchantFilterDto {
  weezeventMerchantId: string;
  name: string;
}

export interface FiltersDto {
  events: EventFilterDto[];
  shops: ShopFilterDto[];
  weezevent: {
    locations: WeezeventLocationFilterDto[];
    merchants: WeezeventMerchantFilterDto[];
  };
}

export interface KpisDto {
  revenueHt: number;
  transactions: number;
  avgTicketHt: number;
  attendees: number;
  revenuePerAttendee: number;
  conversionRate: number;
  topSellingCategory: string | null;
  refundRate: number;
}

interface ChartSeriesDto {
  key: string;
  label: string;
  values: number[];
}

interface ChartDto {
  labels: string[];
  series: ChartSeriesDto[];
}

export interface ChartsDto {
  revenueOverTime: ChartDto;
  revenueByShopOverTime: ChartDto;
}

interface TopShopDto {
  spaceElementId: string;
  name: string;
  revenueHt: number;
}

interface TopProductDto {
  weezeventProductId: string;
  name: string;
  revenueHt: number;
  quantity: number;
}

export interface ListsDto {
  topShops: TopShopDto[];
  topProducts: TopProductDto[];
}

export interface DashboardResponseDto {
  meta: DashboardMetaDto;
  space?: SpaceInfoDto;
  filters?: FiltersDto;
  kpis?: KpisDto;
  charts?: ChartsDto;
  lists?: ListsDto;
}
