-- =============================================================================
-- Field Shift — 002_seed_sources
-- Eight sources from docs/DATA_SOURCE_REGISTER.md. All metadata is factual and
-- verified where marked; no observations and no measurements are seeded.
-- Idempotent: safe to run twice (test D11).
-- =============================================================================

insert into public.data_sources
  (id, provider, product, url, data_class, variables, units, spatial_resolution,
   temporal_resolution, coverage, history, auth_required, usable_at_pilot, mvp_role, limitations)
values
  ('nasa_power', 'NASA LaRC', 'POWER Agroclimatology — daily point (MERRA-2 based)',
   'https://power.larc.nasa.gov/docs/services/api/', 'reanalysis',
   array['T2M','T2M_MAX','T2M_MIN','PRECTOTCORR','RH2M','ALLSKY_SFC_SW_DWN','WS2M','GWETROOT','GWETPROF'],
   '{"T2M":"C","T2M_MAX":"C","T2M_MIN":"C","PRECTOTCORR":"mm/day","RH2M":"%","ALLSKY_SFC_SW_DWN":"MJ/m^2/day","WS2M":"m/s","GWETROOT":"1","GWETPROF":"1"}'::jsonb,
   '0.5 x 0.625 deg (MERRA-2)', 'daily', 'global', '1980-present (MERRA-2)', false, 'yes', 'evidence',
   array['Reanalysis, not a field measurement','Not a forecast','About 50 km grid cells']),

  ('soilgrids', 'ISRIC — World Soil Information', 'SoilGrids 2.0 (250 m digital soil mapping)',
   'https://soilgrids.org/', 'observation',
   array['clay','sand','soc','phh2o'],
   '{"clay":"%","sand":"%","soc":"g/kg","phh2o":"pH"}'::jsonb,
   '250 m', 'static', 'global', 'static prediction', false, 'partial', 'reference',
   array['Model prediction, not a laboratory measurement','Null values occur at some points']),

  ('gibs_smap', 'NASA GIBS / NSIDC DAAC', 'SMAP L3 Passive Enhanced Day Soil Moisture (imagery tiles)',
   'https://gibs.earthdata.nasa.gov/', 'observation', array['soil_moisture'], '{}'::jsonb,
   '9 km native, rendered at 2 km', 'daily (2015-present)', 'global', '2015-present', false, 'partial', 'context',
   array['Imagery only; no numeric values are used','Mixed pixels far larger than a field']),

  ('gibs_imerg', 'NASA GIBS / GES DISC', 'GPM IMERG Precipitation Rate (imagery tiles)',
   'https://gibs.earthdata.nasa.gov/', 'observation', array['precipitation'], '{}'::jsonb,
   '0.1 deg native, rendered at 2 km', 'daily', 'global 60N-60S', '2000-present', false, 'partial', 'context',
   array['Imagery only; no numeric values are used']),

  ('gibs_modis_ndvi', 'NASA GIBS / LP DAAC', 'MODIS Terra NDVI 8-day (imagery tiles)',
   'https://gibs.earthdata.nasa.gov/', 'observation', array['ndvi'], '{}'::jsonb,
   '250 m', '8-day composite', 'global', '2000-present', false, 'partial', 'context',
   array['Mixed pixels larger than most holdings','Never used in scoring']),

  ('cmr', 'NASA CMR', 'Common Metadata Repository granule search',
   'https://cmr.earthdata.nasa.gov/search/', 'observation', array[]::text[], '{}'::jsonb,
   'product dependent', 'product dependent', 'global', 'product dependent', false, 'yes', 'reference',
   array['Metadata availability only; no values retrieved']),

  ('punjab_crs', 'Crop Reporting Service, Agriculture Department, Punjab',
   'Crops Life Calendar and district crop estimates',
   'https://agripunjab.gov.pk/system/files/Crops%20Life%20Calendar2.pdf', 'historical',
   array['crop_calendar','district_area','district_production'], '{}'::jsonb,
   'district', 'seasonal', 'Punjab, Pakistan', 'various years', false, 'yes', 'reference',
   array['District/province recommendations, not farm-specific dates']),

  ('pau_agriculture', 'Punjab Agricultural University',
   'Package of Practices for Crops of Punjab',
   'https://pau.edu/content/ccil/pf/pp_rabi.pdf', 'historical',
   array['rotation_sequences','sowing_windows'], '{}'::jsonb,
   'province', 'seasonal', 'Punjab, Pakistan', 'current edition', false, 'yes', 'reference',
   array['Advisory guidance, not a measurement'])
on conflict (id) do nothing;

insert into public.schema_migrations (version) values ('002_seed_sources')
  on conflict (version) do nothing;
