-- =============================================================================
-- Field Shift — 003_seed_catalog
-- Crops and rotations with citations from docs/AGRICULTURAL_EVIDENCE.md.
--
-- Deliberate honesty constraints carried into data:
--   * water_demand_class / heat_sensitivity are NULL: no page-level source has
--     been extracted yet (open question Q2). They stay NULL rather than guessed.
--   * mungbean.selectable = false: its SOWING window is unsourced, and the
--     selectable_needs_calendar constraint forbids offering it.
--   * no yields, no prices, no soil measurements.
-- Idempotent: safe to run twice (test D11).
-- =============================================================================

insert into public.crop_catalog
  (id, name, local_name, season, sowing_start_md, sowing_end_md, harvest_start_md, harvest_end_md,
   water_demand_class, heat_sensitivity, is_legume, residue_class, selectable, verified,
   source_urls, evidence_quality, limitations)
values
  ('wheat', 'Wheat', 'Gandum', 'rabi', '11-01', '11-20', '04-01', '05-05',
   null, null, false, null, true, true,
   array['https://agripunjab.punjab.gov.pk/aari-cvwheat',
         'https://agripunjab.gov.pk/system/files/Calendar%20YES%20Rabi%202020.pdf'],
   'high',
   array['Windows are district/province recommendations, not this farm''s dates']),

  ('cotton', 'Cotton', 'Kapaas', 'kharif', '04-01', '05-31', '07-15', '11-30',
   null, null, false, null, true, true,
   array['https://agripunjab.gov.pk/system/files/Final%20Kharif%20Estimates%202025-26_1.pdf',
         'https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf'],
   'high',
   array['Multi-pick crop: harvest spans months','Water-demand class not yet sourced']),

  ('rice', 'Rice', 'Chawal', 'kharif', '05-20', '07-15', '09-15', '11-25',
   null, null, false, null, true, true,
   array['https://agripunjab.gov.pk/system/files/Calendar%20Annual%20CRS%20Activities%202022_3.pdf',
         'https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf'],
   'high',
   array['Minority practice in Faisalabad district','Water-demand class not yet sourced']),

  ('maize', 'Maize', 'Makka', 'kharif', '05-25', '06-30', '11-01', '11-30',
   null, null, false, null, true, true,
   array['https://pau.edu/content/ccil/pf/pp_kharif.pdf',
         'https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf'],
   'medium',
   array['Spring and autumn maize have different windows','Water-demand class not yet sourced']),

  ('mungbean', 'Mungbean', 'Moong', 'kharif', null, null, '08-01', '09-15',
   null, null, true, null, false, false,
   array['https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf'],
   'medium',
   array['Sowing window not yet sourced: crop cannot be selected until it is']),

  ('sugarcane', 'Sugarcane', 'Ganna', 'annual', null, null, '01-01', '03-30',
   null, null, false, null, false, true,
   array['https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf'],
   'high',
   array['Multi-year crop: not offered as an MVP rotation phase'])
on conflict (id) do nothing;

insert into public.rotation_templates (id, label, phases, why_included, source_urls, active)
values
  ('wheat-cotton', 'Wheat - Cotton',
   '[{"cropId":"wheat","season":"rabi"},{"cropId":"cotton","season":"kharif"}]'::jsonb,
   'Documented Punjab rotation (PAU Package of Practices); cotton-wheat is the dominant kharif rotation in Faisalabad division per CRS district estimates.',
   array['https://pau.edu/content/ccil/pf/pp_rabi.pdf',
         'https://agripunjab.gov.pk/system/files/Final%20Kharif%20Estimates%202025-26_1.pdf'], true),

  ('wheat-maize', 'Wheat - Maize',
   '[{"cropId":"wheat","season":"rabi"},{"cropId":"maize","season":"kharif"}]'::jsonb,
   'Documented Punjab rotation (PAU Package of Practices); both spring and autumn maize windows are recorded in the CRS crop calendars.',
   array['https://pau.edu/content/ccil/pf/pp_rabi.pdf',
         'https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf'], true),

  ('wheat-maize-mung', 'Wheat - Maize + Summer Mung',
   '[{"cropId":"wheat","season":"rabi"},{"cropId":"maize","season":"kharif"},{"cropId":"mungbean","season":"kharif"}]'::jsonb,
   'Documented Punjab rotation adding a legume phase (PAU lists Rice-Wheat-Summer Moong); the CRS calendar supplies the mung harvest window.',
   array['https://pau.edu/content/ccil/pf/pp_rabi.pdf',
         'https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf'], true),

  ('wheat-rice', 'Wheat - Rice',
   '[{"cropId":"wheat","season":"rabi"},{"cropId":"rice","season":"kharif"}]'::jsonb,
   'Documented Punjab rotation (PAU Package of Practices). Flagged in the product: rice is a minority kharif practice in Faisalabad district compared with the Sheikhupura belt.',
   array['https://pau.edu/content/ccil/pf/pp_rabi.pdf',
         'https://agripunjab.gov.pk/system/files/Calendar%20Annual%20CRS%20Activities%202022_3.pdf'], true)
on conflict (id) do nothing;

insert into public.schema_migrations (version) values ('003_seed_catalog')
  on conflict (version) do nothing;
