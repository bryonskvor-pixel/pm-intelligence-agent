import { d1Query } from '../src/lib/cloudflare.js';

const PARAMS_DB_ID = '18812c7c-0661-4e87-beaa-926b18f13a67';
const DATE = '2026-07-01';

const rows = [];
function add(model_id, parameter_name, value, unit, source_doc) {
  rows.push([model_id, 'Euro-Wall', parameter_name, value, unit ?? '', source_doc, DATE]);
}

// ---- Brand-wide (EUROWALL-GENERAL) ----
add('EUROWALL-GENERAL', 'max_header_deflection', '3/16', 'in', 'all install guides (MS/DS/FoldC3/FoldC5/Pivot)');
add('EUROWALL-GENERAL', 'sill_level_tolerance', 'no more than 1/16 in sag at center span, no bow permitted anywhere', 'in', 'all install guides');
add('EUROWALL-GENERAL', 'opening_measurement_requirement', 'measure opening at minimum 3 points for plumb/square/level before install', '-', 'all install guides');
add('EUROWALL-GENERAL', 'frame_assembly_practice', 'DO NOT ASSEMBLE FRAME ON THE GROUND — assemble on padded sawhorses', '-', 'all install guides');
add('EUROWALL-GENERAL', 'min_installer_crew_under_8ft', '2', 'people', 'all install guides');
add('EUROWALL-GENERAL', 'min_installer_crew_over_8ft', '4', 'people', 'all install guides');
add('EUROWALL-GENERAL', 'panel_handling_caution', 'Never "walk" panels', '-', 'all install guides');
add('EUROWALL-GENERAL', 'shim_material_requirement', 'Shim/insulation material between frame and opening must be non-expandable', '-', 'MS + FoldC3 install guides');
add('EUROWALL-GENERAL', 'sealant_type', 'DOW 795 or 100% silicone; frame must be fully embedded in sealant before setting', '-', 'all install guides');
add('EUROWALL-GENERAL', 'sill_pan_recommendation', 'Sill pan recommended for all installations (supplied by others, not Euro-Wall); water drainage tubes not provided by Euro-Wall', '-', 'MS/DS/Pivot install guides');
add('EUROWALL-GENERAL', 'header_screw_min_penetration', '1.5', 'in', 'MS + FoldC3 install guides');
add('EUROWALL-GENERAL', 'header_overtighten_caution', 'Over-tightening header screws can pinch/bow the frame and cause panel/door operation issues', '-', 'MS + FoldC3 install guides');
add('EUROWALL-GENERAL', 'protective_film_removal_window', 'Protective film must be removed within 30 days of delivery or finish damage can occur (warranty-voiding)', 'days', 'all install guides');
add('EUROWALL-GENERAL', 'wood_clad_finish_window', 'Wood-clad veneer products must be finished/sealed within 36 hours of delivery, or stored in climate-controlled space', 'hours', 'all install guides');
add('EUROWALL-GENERAL', 'maintenance_frequency_general', 'Hardware lubrication/corrosion protection required every 3 months in general environments to keep warranty valid', 'months', 'all install guides');
add('EUROWALL-GENERAL', 'maintenance_frequency_marine_coastal', 'Every month for marine/coastal (within 5 miles of water), industrial, or pool environments', 'months', 'all install guides');
add('EUROWALL-GENERAL', 'boeshield_reapplication_general', 'Boeshield T-9 reapplication every 6 months in general environments', 'months', 'all install guides');
add('EUROWALL-GENERAL', 'boeshield_reapplication_marine', 'Boeshield T-9 reapplication every 3 months marine/industrial', 'months', 'all install guides');
add('EUROWALL-GENERAL', 'maintenance_warranty_condition', 'Failure to provide proof of maintenance voids warranty', '-', 'all install guides');
add('EUROWALL-GENERAL', 'deviation_warranty_condition', 'Deviating from recommended install procedures could impair functionality and could void any warranty', '-', 'all install guides');
add('EUROWALL-GENERAL', 'finish_standard_kynar', 'AAMA 2605 Kynar, colors: White (UC40577), Sunstorm Arcadia Silver (UC70123F), Bronze (UC91252), Black (UC40577)', '-', 'Vista CT / Vista TL brochures');
add('EUROWALL-GENERAL', 'finish_clear_anodized', 'Clear Anodized available', '-', 'Vista CT / Vista TL brochures');
add('EUROWALL-GENERAL', 'finish_custom_options', 'Custom powder coat/Kynar and faux woodgrain (AAMA 2604 via die-sublimation powder coat) available', '-', 'Vista CT / Vista TL brochures');
add('EUROWALL-GENERAL', 'finish_wood_clad_interior', 'Interior wood clad veneer option (mahogany/sapele, white oak, additional/exotic species: ash, birch, curly maple, red oak, walnut, zebrawood)', '-', 'Vista CT / Vista TL brochures');
add('EUROWALL-GENERAL', 'warranty_standard', '10-year limited warranty', 'years', 'Vista CT / Vista TL brochures');
add('EUROWALL-GENERAL', 'muntin_sdl_availability', 'Muntin/SDL aluminum grille profiles available brand-wide; separate profile charts exist per glass thickness (9/16 in and 1 in) and per product line (DS, MS, Fold/Pivot/CT share the 9/16 in and 1 in charts)', '-', 'muntin_sdl_profile_chart_*.pdf');
add('EUROWALL-GENERAL', 'reducer_bar_shared_parts', 'Reducer bar part numbers E0062 (1/4 in) and E0063 (9/16 in) are identical/shared across Fold C3, Fold C5, and Pivot lines', '-', 'extrusion profile sheets (FoldC3/FoldC5/Pivot)');

// ---- Vista DS (Fixed Window / Direct Set) ----
add('EUROWALL-DS', 'category', 'Fixed, non-operable glass window system — glass set directly into frame via glazing reducers/gaskets, no panels/tracks/hardware', '-', 'vista_ds_brochure_v1_102025.pdf');
add('EUROWALL-DS', 'fl_product_approval', 'FL46965', '-', 'ew-print-directsetconfigurations-v02.pdf');
add('EUROWALL-DS', 'configuration_options', 'DS 1 Lite, DS 2 Lite, DS 5 Lite Narrow Ends, DS 6 Lite, DS Trapezoid (angled head)', '-', 'ew-print-directsetconfigurations-v02.pdf');
add('EUROWALL-DS', 'trapezoid_max_angle', '25', 'deg', 'ew-print-directsetconfigurations-v02.pdf');
add('EUROWALL-DS', 'frame_cover_dims', 'FRAME|E0223 + COVER|E0224 — top flange 1 in wide, 3/16 in lip, body 2 in H x 3 in W', 'in', 'vista_ds_extrusionsheet_v1_102025.pdf');
add('EUROWALL-DS', 'male_divider_cover_dims', 'MALE DIVIDER|E0227 (1 in W x 5 5/16 in H) + MALE COVER|E0229 (1 1/8 in W x 3 3/16 in H)', 'in', 'vista_ds_extrusionsheet_v1_102025.pdf');
add('EUROWALL-DS', 'female_divider_cover_dims', 'FEMALE DIVIDER|E0228 (1 in W x 2 in H) + FEMALE COVER|E0230 (1 1/8 in W x 2 1/16 in H)', 'in', 'vista_ds_extrusionsheet_v1_102025.pdf');
add('EUROWALL-DS', 'glass_bead_1in', '1 in GLASS BEAD | E0010 — 5/16 in W x 1 1/8 in H', 'in', 'vista_ds_extrusionsheet_v1_102025.pdf');
add('EUROWALL-DS', 'glass_reducer_quarter_in', '1/4 in GLASS REDUCER | E0226 — 1 1/16 in W x 1 3/16 in H', 'in', 'vista_ds_extrusionsheet_v1_102025.pdf');
add('EUROWALL-DS', 'glass_reducer_9_16in', '9/16 in GLASS REDUCER | E0225 — 3/4 in W x 1 5/16 in H', 'in', 'vista_ds_extrusionsheet_v1_102025.pdf');
add('EUROWALL-DS', 'glass_thickness_options', '1/4 in, 9/16 in, 1 in (per available glass bead/reducer parts)', 'in', 'vista_ds_extrusionsheet_v1_102025.pdf');

// ---- Vista Multi Slide (Sliding Door System) ----
add('EUROWALL-MS', 'category', 'Sliding door system, 2 to 5 track configurations', '-', 'vista_ms_brochure_v1_102025-1.pdf');
add('EUROWALL-MS', 'track_2track_dims', '2 TRACK | E0015 — 4 3/16 in x 2 in', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'track_2track_addon_dims', '2 TRACK ADD ON | E0167 — 5 3/16 in x 2 in', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'track_3track_dims', '3 TRACK | E0016 — 6 9/16 in x 2 in', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'track_4track_dims', '4 TRACK | E0018 — 9 in x 2 in', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'track_5track_dims', '5 TRACK | E0019 — 11 3/8 in x 2 in', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'ada_sill', 'ADA Sill, interior only, 1/2 in H', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'interlock_standard', 'INTERLOCK | E0009 — 1 5/16 in x 4 1/4 in', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'interlock_slimlock_optional', 'SLIM-LOCK INTERLOCK (optional, non-impact) | E0240 — 1 5/16 in x 3 1/2 in', 'in', 'vista_ms_extrusionsheet_v1_102025.pdf');
add('EUROWALL-MS', 'sill_shim_spacing', 'Sill shimmed at minimum every other pre-drilled anchor location', '-', 'vista_ms_installguide_v1_102025.pdf');
add('EUROWALL-MS', 'weephole_size', '5/16', 'in', 'vista_ms_installguide_v1_102025.pdf');
add('EUROWALL-MS', 'weephole_requirement', 'Required for half/no-embed sill applications, drilled through face of sill at each panel/track location; explicit "do not drill past this point" limits shown to avoid breaching interior chamber', '-', 'vista_ms_installguide_v1_102025.pdf');
add('EUROWALL-MS', 'sill_embed_options', 'Full embed / half embed / no embed configurations, each with different drain configurations', '-', 'vista_ms_installguide_v1_102025.pdf');
add('EUROWALL-MS', 'hardware_adjustment_tooling', 'Vertical/horizontal roller/carrier adjustment via 2.5mm allen key + 1/2-9/16 in ratchet', '-', 'vista_ms_installguide_v1_102025.pdf');
add('EUROWALL-MS', 'panel_install_sequencing', 'Panels are numbered and must be installed in a specific documented sequence that varies by configuration', '-', 'vista_ms_installguide_v1_102025.pdf');
add('EUROWALL-MS', 'comparison_chart_dimensions', 'Comparison chart distinguishes models/configurations by track count, largest glass DLO, panel counts, and configuration codes (2-panel, 3-panel, 4-panel OX/XO/OXXO arrangements)', '-', 'euro-vista-multi-slide-comparison-chart-1.pdf');

// ---- Vista Fold C3 (Impact Rated) ----
add('EUROWALL-FOLD-C3', 'category', 'Impact-rated aluminum folding door system', '-', 'vista_foldc3_brochure_v1_102025.pdf');
add('EUROWALL-FOLD-C3', 'fl_product_approval', 'FL17838', '-', 'vista_foldc3_brochure_v1_102025.pdf');
add('EUROWALL-FOLD-C3', 'sill_standard', 'Standard Sill (E0037) — Water Rated, HVHZ Impact Rated', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'sill_standard_modified', 'Standard Modified Sill (E0034) — HVHZ Impact Rated', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'sill_ada', 'ADA Sill (E0028) — HVHZ Impact Rated', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'sill_channel', 'Channel Sill (E0108) — Non-FPA (NOT impact/FPA rated); friction/notch-fit only, NOT screwed to jambs, butted against both jambs', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'center_wall_pivot_threshold', 'Center Wall Pivot Cup and center wall pivot hardware only required for panels over 72 in', 'in', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'sill_liner_inspection_dependency', 'DO NOT INSTALL SILL LINER UNTIL AFTER THE INSPECTION — once installed it must be cut to remove (destructive removal)', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'panel_sequencing_split', 'Split configuration: install left jamb-connecting panel to the split point first, then start at opposite jamb and work toward the split last (e.g. sequence 1,2,3 then 5,4)', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'panel_sequencing_single_direction', 'Single-direction opening: start at jamb-side connection and install sequentially working back from the jamb (e.g. 1,2,3,4,5)', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'hinge_attach_order', 'Hinges for the next panel must be attached to the previous panel FIRST before offering up the new panel; do not force hinge screws before holes are aligned (can bend the hinge)', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'astragal_sequencing', 'Astragal must be removed before installing carriers/hinges and reinstalled after', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'sweep_install_spec', 'Leave 1/8 in gap between sweep and lower carrier/jamb hinge; compress sweep so no daylight shows at sill; must not screw into corner-key zone (4 in from stile into bottom rail)', 'in', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'magnetic_catch_dependency', 'Magnetic door catch (swing panels only) installation must occur after sweep installation is complete', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'weatherstrip_profiles', 'Two profiles applied based on hinge leaf configuration: "small p" (C0113) for single modified hinge leaf, "large p" (C0112) for two modified hinge leafs — misapplication is a documented failure mode', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'anti_rattle_catch_condition', 'Anti-rattle catches only required if the multipoint lock secures to an astragal panel (not required if it secures into the jamb)', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'handing_designation', 'LORI (Left Outswing/Right Inswing) vs ROLI (Right Outswing/Left Inswing) part numbering — shop drawings must specify correct handing', '-', 'vista_foldc3_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C3', 'sweep_sizes', 'C0051 (3 ft), C0052 (4 ft), C0053 (8 ft)', 'ft', 'vista_foldc3_extrusionsheet_v1_092025.pdf');
add('EUROWALL-FOLD-C3', 'reducer_bar_quarter_in', '1/4 in REDUCER BAR | E0062 — 11/16 in x 5/8 in', 'in', 'vista_foldc3_extrusionsheet_v1_092025.pdf');
add('EUROWALL-FOLD-C3', 'reducer_bar_9_16in', '9/16 in REDUCER BAR | E0063 — 9/16 in x 5/8 in', 'in', 'vista_foldc3_extrusionsheet_v1_092025.pdf');

// ---- Vista Fold C5 (Thermally Broken) ----
add('EUROWALL-FOLD-C5', 'category', 'Thermally broken aluminum folding door system (no HVHZ-specific sill designations, unlike Fold C3)', '-', 'vista_foldc5_brochure_v1_102025final.pdf');
add('EUROWALL-FOLD-C5', 'fl_product_approval', 'FL27023', '-', 'vista_foldc5_brochure_v1_102025final.pdf');
add('EUROWALL-FOLD-C5', 'install_sequence_pattern', 'Same structural/sequencing pattern as Fold C3: frame assembly, weatherstripping, dry fit, install frame, install panels sequentially, sweeps, sill liner, anti-rattle hardware, maintenance — but without HVHZ-specific sill rating designations', '-', 'vista_foldc5_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C5', 'hardware_adjustment', 'Same carrier/jamb hinge adjustment system as other Fold lines: 2.5mm allen key + ratchet', '-', 'vista_foldc5_installguide_v3_052026.pdf');
add('EUROWALL-FOLD-C5', 'reducer_bar_quarter_in', '1/4 in REDUCER BAR | E0062 — 11/16 in x 5/8 in', 'in', 'vista_foldc5_extrusionsheet_v1_092025.pdf');
add('EUROWALL-FOLD-C5', 'reducer_bar_9_16in', '9/16 in REDUCER BAR | E0063 — 9/16 in x 5/8 in', 'in', 'vista_foldc5_extrusionsheet_v1_092025.pdf');
add('EUROWALL-FOLD-C5', 'sweep_sizes', 'C0051 (3 ft), C0052 (4 ft), C0053 (8 ft)', 'ft', 'vista_foldc5_extrusionsheet_v1_092025.pdf');

// ---- Vista Fold Multi-Directional (configuration variant) ----
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'category', 'Configuration variant of standard Vista Fold — panels fold AND slide in either direction (not fixed to one stacking side), enabling double-egress and mid-span opening points', '-', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'rating_inheritance', 'Shares all DP ratings, panel size options, and water ratings with the standard Vista Fold (C3/C5) line — no separate DP chart published', '-', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'max_panel_weight_impact', '350', 'lbs', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'max_panel_height_impact', '168', 'in', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'max_panel_height_non_impact', '180', 'in', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'max_panel_width', '52', 'in', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'min_panel_height', '20', 'in', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'min_panel_width', '20', 'in', 'vistafold_multi-directional-final.pdf');
add('EUROWALL-FOLD-MULTIDIRECTIONAL', 'panel_thickness', '2.25', 'in', 'vistafold_multi-directional-final.pdf');

// ---- Vista Pivot (Impact Rated) ----
add('EUROWALL-PIVOT', 'category', 'Impact-rated aluminum pivot door system', '-', 'vista_pivot_brochure_v1_102025.pdf');
add('EUROWALL-PIVOT', 'fl_product_approval', 'FL22410', '-', 'vista_pivot_brochure_v1_102025.pdf');
add('EUROWALL-PIVOT', 'flooring_sequencing_dependency', 'Finished floor must be installed prior to pivot door installation. If not possible, a temporary substrate (wood bucking or starboard) can be used to install the pivot cup, but the panel will have to be removed later to properly drill the bottom pivot cup once flooring is finished. If project has a sidelight with a mullion, leave the floor unfinished at the mullion clip location only.', '-', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'bottom_pivot_pin_ground_contact', 'The bottom pivot pin should never make contact with the ground (can damage pin/panel); panel must rest on minimum 1.5 in thick 2x4 blocking during installation', 'in', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'top_pivot_pin_install', 'Predrilled 3/16 in pilot then 1 in hole (bit type depends on substrate: wood/steel/SDS for concrete); top pivot pin must fit flush', 'in', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'top_pivot_pin_tolerance', 'Two-stage wrench technique (15mm wrench first half, 14mm wrench second half) to achieve an even 3/8 in gap top and bottom', 'in', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'bottom_pivot_cup_a', 'Bottom Pivot Cup A: 3/4 in hole drilled to 1 1/4 in depth; secured via 3/16 in SDS pilot + 1/4 in tapcon', 'in', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'shootbolt_cups', 'Shootbolt cups B/C/D/E: 3/4 in holes (stepped drilling 1/4 in to 1/2 in to 3/4 in through header), secured with 1/4 in tapcon after 3/16 in SDS pilot', 'in', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'swing_orientations', 'Four orientations: LH Outswing, LH Inswing, RH Outswing, RH Inswing — each with distinct jamb profile and shootbolt cup lettering (A-E)', '-', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'jamb_profile_by_orientation', 'Active Jamb (E0033) vs Riserless Jamb (E0045) differ by swing orientation', '-', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'lock_config_ladder_pull', 'Ladder Pull lock configuration: 1-point/2-point lock split', '-', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'lock_config_multipoint', 'Multipoint Handle lock configuration uses modified shootbolt cup C0077 instead of standard C0210 for cups B/C — part-substitution rule tied to hardware selection', '-', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'water_management_kit', 'Optional Water Management Kit (C0035) + Channel Sill (E0108): drain aligned to center of drainage channel at inside edge of panel, no kinks in drain tube, channel sill secured leaving 1/4 in gap under floor covering (tile etc.) to allow water into drainage channel, all screw penetrations and channel ends sealed, drainage system must be tested for leaks before completion', 'in', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'twinpoint_lever', 'Removable Twinpoint Lever (C0061) is a supplemental storm/inclement-weather locking feature (top+bottom shootbolt), separate from day-to-day handle operation', '-', 'vista_pivot_installguide_v1_102025.pdf');
add('EUROWALL-PIVOT', 'sweep_hardware', 'Bottom Mount Sweeps | C0334', '-', 'vista_pivot_extrusionsheet_v1_101625.pdf');
add('EUROWALL-PIVOT', 'reducer_bars', '1/4 in Reducer | E0062 (11/16 in x 5/8 in); 9/16 in Reducer | E0063 (9/16 in x 5/8 in)', 'in', 'vista_pivot_extrusionsheet_v1_101625.pdf');

// ---- Vista CT (Casement — new line) ----
add('EUROWALL-CT', 'category', 'Operable casement/awning-style outswing window system — Euro-Wall\'s first operable window line; uses proprietary Mull-Link system (no anchors/clips at mulls for multi-window runs)', '-', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'fl_product_approval', 'FL47078', '-', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'thermal_rating', 'Thermally broken, impact and non-impact rated, HVHZ and WZ3 approved', '-', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'single_unit_max_size', '120 in H x 52 in W (impact and non-impact identical)', 'in', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'single_unit_min_size', '18 in H x 18 in W', 'in', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'multi_unit_max_size_hvhz', '96 in H x 52 in W', 'in', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'multi_unit_max_size_wz3_non_impact', '120 in H x 52 in W', 'in', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'multi_unit_min_size', '18 in H x 18 in W', 'in', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'test_standards', 'Air infiltration ASTM E283/E283M-19; Water infiltration ASTM E331-00; Wind load TAS 202-94; Large missile impact TAS 201-94; Cyclic pressure TAS 203-94; Static pressure TAS 202-94; Forced entry ASTM F588-17', '-', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'design_pressure_single_unit', 'Flat 80 psf across nearly full frame-width range (28-52 in) up to 96 in frame height; tapers at larger sizes — e.g. at 120 in height: 74.3 psf (28 in wide) down to 52.3 psf (52 in wide)', 'psf', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'design_pressure_multi_unit', '80 psf plateau through 96 in height across all tributary widths; HVHZ vs WZ3 DP values diverge above 96-102 in height (WZ3 allows taller units at reduced DP)', 'psf', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'glass_spec', '1 in IG unit; overall glass thickness options 1/4 in, 1/2 in, 9/16 in, 1 in', 'in', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'frame_profiles', 'Vertical & top horizontal frame E0021; sill E0023; Mull-Link profile E0236; sash profiles E0022/E0024/E0025', '-', 'vista_ct_brochure_v1_102025.pdf');
add('EUROWALL-CT', 'warranty', '10-year limited', 'years', 'vista_ct_brochure_v1_102025.pdf');

// ---- Vista TL (Thin Line — new line) ----
add('EUROWALL-TL', 'category', 'Fixed, edge-to-edge thin-line glass wall/window system — minimal 2 in frames, no dividing mull between lites, unlimited lites per opening; positioned for glass-wall/curtain-wall-style architectural applications', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'fl_product_approval', 'FL47174', '-', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'thermal_rating', 'Impact and non-impact rated (NOT stated as thermally broken, unlike Vista CT)', '-', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'single_unit_max_size', '198 in H x 198 in W (HVHZ & WZ3, impact rated); height/width interchangeable for vertical or horizontal orientation', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'single_unit_min_size', '18 in H x 18 in W', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'multi_unit_max_size_hvhz', '144 in frame height x 194 in DLO width', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'multi_unit_max_size_wz3', '198 in frame height x 194 in DLO width', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'multi_unit_min_size', '18 in frame height x 18 in DLO width', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'test_standards', 'Air infiltration ASTM E283/E283M-19; Water infiltration ASTM E331-00; Wind load TAS 202-94; Large missile impact TAS 201-94 & ASTM E1996-20; Cyclic load TAS 203-94 & ASTM E1886-19', '-', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'design_pressure_single_unit', 'Flat 90 psf across nearly entire width range (60-198 in) up to 84 in frame height; begins tapering at 96 in+ height — e.g. 96 in height at 96 in+ width: 78.4 psf', 'psf', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'max_single_glass_lite', "16'-6\" tall and wide — stated as among the largest systems in the industry; unlimited number of lites per opening", 'ft', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'wind_load_headline_claim', 'Up to 90 psf DP achieved with minimal 1-1/8 in glass makeup — impact protection via glass thickness rather than heavier framing', 'psf', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'glass_thickness', '1-1/8', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'frame_profile', 'E0001 — 3 in frame depth, 2 in visible face, 3/4 in and 5/8 in sub-dimensions per profile drawing', 'in', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'out_corner_joinery', 'CAD detail shows an "Out Corner" multi-unit joinery detail — supports outside-corner (90 deg) glass-to-glass corner conditions without a post', '-', 'vista_tl_brochure_v1_102025.pdf');
add('EUROWALL-TL', 'warranty', '10-year limited', 'years', 'vista_tl_brochure_v1_102025.pdf');

async function main() {
  const BATCH_SIZE = 10;
  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params = batch.flat();
    const sql = `INSERT INTO parameters (model_id, brand, parameter_name, value, unit, source_doc, last_verified) VALUES ${placeholders}`;
    await d1Query(PARAMS_DB_ID, sql, params);
    totalInserted += batch.length;
    console.log(`Inserted ${totalInserted}/${rows.length}`);
  }
  console.log('Done. Total rows inserted:', rows.length);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
