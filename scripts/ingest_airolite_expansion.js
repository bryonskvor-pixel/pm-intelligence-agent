import { d1Query } from '../src/lib/cloudflare.js';

const PARAMS_DB_ID = '18812c7c-0661-4e87-beaa-926b18f13a67';
const DATE = '2026-07-01';

const rows = [];
function add(model_id, parameter_name, value, unit, source_doc) {
  rows.push([model_id, 'Airolite', parameter_name, value, unit ?? '', source_doc, DATE]);
}

// ---- Grilles category-wide (AIROLITE-GRILLES-GENERAL) ----
add('AIROLITE-GRILLES-GENERAL', 'min_wind_load_rating', '25', 'psf', 'GrilleScreens_catalog_ARL.pdf + grille spec sheets');
add('AIROLITE-GRILLES-GENERAL', 'max_single_section_size', '72 wide x 120 high, or 120 wide x 72 high', 'in', 'grille spec sheets (AFG100/ABG100/CBG100/LBG100/GSG100)');
add('AIROLITE-GRILLES-GENERAL', 'min_fillet_weld_shear_capacity', '526', 'lbs', 'grille spec sheets');
add('AIROLITE-GRILLES-GENERAL', 'min_weld_length', '1', 'in', 'grille spec sheets');
add('AIROLITE-GRILLES-GENERAL', 'min_weld_leg', '0.125', 'in', 'grille spec sheets');
add('AIROLITE-GRILLES-GENERAL', 'weld_process', 'Pulsed Gas Metal Arc Welding (GMAW/Mig)', '-', 'grille spec sheets');
add('AIROLITE-GRILLES-GENERAL', 'submittal_requirement', 'PE-stamped theoretical weld shear calculations required demonstrating 526 lb minimum shear per fillet weld', '-', 'grille spec sheets');

// ---- Bar Grilles ----
add('AFG100', 'grille_type', 'Airfoil', '-', 'AFG100_spec_ARL.pdf');
add('AFG100', 'material', 'Extruded Aluminum, Alloy 6063-T5', '-', 'AFG100_spec_ARL.pdf');
add('AFG100', 'depth_range', '3.5-6', 'in', 'AFG100_spec_ARL.pdf');
add('AFG100', 'blade_thickness', '0.081', 'in', 'AFG100_spec_ARL.pdf');
add('AFG100', 'blade_angle_range', '0-60', 'deg', 'AFG100_spec_ARL.pdf');
add('AFG100', 'horizontal_spacing_range', '2-12', 'in', 'AFG100_spec_ARL.pdf');

add('ABG100', 'grille_type', 'Angular Bar', '-', 'GrilleScreens_catalog_ARL.pdf');
add('ABG100', 'depth_range', '2-6', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ABG100', 'material_thickness_range', '0.081-0.250', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ABG100', 'blade_angle_range', '0-60', 'deg', 'GrilleScreens_catalog_ARL.pdf');
add('ABG100', 'horizontal_spacing_range', '2-12', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ABG100', 'vertical_spacing_range', '2-12', 'in', 'GrilleScreens_catalog_ARL.pdf');

add('CBG100', 'grille_type', 'Continue-Line', '-', 'CBG100_spec_ARL.pdf');
add('CBG100', 'material', 'Extruded Aluminum, Alloy 6063-T5', '-', 'CBG100_spec_ARL.pdf');
add('CBG100', 'depth_range', '2-6', 'in', 'CBG100_spec_ARL.pdf');
add('CBG100', 'material_thickness_range', '0.081-0.250', 'in', 'CBG100_spec_ARL.pdf');
add('CBG100', 'horizontal_bar_angle_range', '0-45', 'deg', 'CBG100_spec_ARL.pdf');
add('CBG100', 'horizontal_spacing_range', '2-12', 'in', 'CBG100_spec_ARL.pdf');
add('CBG100', 'vertical_spacing_range', '2-12', 'in', 'CBG100_spec_ARL.pdf');

add('LBG100', 'grille_type', 'Linear Bar', '-', 'LBG100_spec_ARL.pdf');
add('LBG100', 'material', 'Extruded Aluminum, Alloy 6063-T5', '-', 'LBG100_spec_ARL.pdf');
add('LBG100', 'depth_range', '2-6', 'in', 'LBG100_spec_ARL.pdf');
add('LBG100', 'material_thickness_range', '0.081-0.250', 'in', 'LBG100_spec_ARL.pdf');
add('LBG100', 'horizontal_spacing_range', '2-12', 'in', 'LBG100_spec_ARL.pdf');
add('LBG100', 'vertical_spacing_range', '2-12', 'in', 'LBG100_spec_ARL.pdf');

add('GIG100', 'grille_type', 'Gemini', '-', 'GrilleScreens_catalog_ARL.pdf');
add('GIG100', 'depth_range', '3-6', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('GIG100', 'material_thickness_range', '0.081-0.250', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('GIG100', 'blade_angle', '45', 'deg', 'GrilleScreens_catalog_ARL.pdf');
add('GIG100', 'horizontal_spacing_range', '5.5-11', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('GIG100', 'vertical_spacing_range', '9-48', 'in', 'GrilleScreens_catalog_ARL.pdf');

add('SLG100', 'grille_type', 'Solar-Line', '-', 'GrilleScreens_catalog_ARL.pdf');
add('SLG100', 'depth_range', '2-6', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SLG100', 'material_thickness_range', '0.081-0.250', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SLG100', 'blade_angle_range', '0-45', 'deg', 'GrilleScreens_catalog_ARL.pdf');
add('SLG100', 'horizontal_spacing_range', '2-12', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SLG100', 'vertical_spacing_range', '2-12', 'in', 'GrilleScreens_catalog_ARL.pdf');

// ---- Geometric Grilles ----
add('CGG100', 'grille_type', 'Circular', '-', 'GrilleScreens_catalog_ARL.pdf');
add('CGG100', 'depth_range', '2-6', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('CGG100', 'material_thickness', '0.100', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('CGG100', 'blade_angle_range', '0-45', 'deg', 'GrilleScreens_catalog_ARL.pdf');
add('CGG100', 'horizontal_spacing', '6 on center', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('CGG100', 'vertical_spacing', '6 on center', 'in', 'GrilleScreens_catalog_ARL.pdf');

add('MG100', 'grille_type', 'Matrix', '-', 'GrilleScreens_catalog_ARL.pdf');
add('MG100', 'depth_range', '2-6', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('MG100', 'material_thickness_range', '0.081-0.250', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('MG100', 'horizontal_spacing_range', '2-12', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('MG100', 'vertical_spacing_range', '2-12', 'in', 'GrilleScreens_catalog_ARL.pdf');

add('PDG100', 'grille_type', 'Prism', '-', 'GrilleScreens_catalog_ARL.pdf');
add('PDG100', 'depth_range', '2-4', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('PDG100', 'material_thickness_range', '0.081-0.125', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('PDG100', 'horizontal_spacing_range', '4-12', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('PDG100', 'vertical_spacing_range', '4-12', 'in', 'GrilleScreens_catalog_ARL.pdf');

add('GSG100', 'grille_type', 'Sansome', '-', 'GSG100_spec_ARL.pdf');
add('GSG100', 'material', 'Aluminum Plate, Alloy 5052-H32', '-', 'GSG100_spec_ARL.pdf');
add('GSG100', 'depth_range', '0.25-6', 'in', 'GSG100_spec_ARL.pdf');
add('GSG100', 'material_thickness_range', '0.250-0.500', 'in', 'GSG100_spec_ARL.pdf');
add('GSG100', 'perimeter_frame_options', 'No Frame, Aluminum Channel, or Tube', '-', 'GSG100_spec_ARL.pdf');
add('GSG100', 'geometric_pattern', 'Custom, as indicated on Contract Drawings (AutoCAD-detailed)', '-', 'GSG100_spec_ARL.pdf');

add('TG100', 'grille_type', 'Tetra', '-', 'GrilleScreens_catalog_ARL.pdf');
add('TG100', 'depth_range', '2-4', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('TG100', 'material_thickness_range', '0.081-0.125', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('TG100', 'blade_angle_range', '0-45', 'deg', 'GrilleScreens_catalog_ARL.pdf');
add('TG100', 'horizontal_spacing_range', '4-12', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('TG100', 'vertical_spacing_range', '4-12', 'in', 'GrilleScreens_catalog_ARL.pdf');

// ---- Louver Screens (horizontal blade) ----
add('ENCB609', 'screen_type', 'Horizontal Blade', '-', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB609', 'depth', '4', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB609', 'material_thickness', '0.081', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB609', 'free_area_4x4_unit', '8.23', 'sq ft', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB609', 'pct_free_area', '51', '%', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB609', 'vertical_support', 'Extruded Aluminum Z-Support', '-', 'GrilleScreens_catalog_ARL.pdf');

add('ENCB6096', 'screen_type', 'Horizontal Blade', '-', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6096', 'depth', '6', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6096', 'material_thickness', '0.081', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6096', 'free_area_4x4_unit', '8.39', 'sq ft', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6096', 'pct_free_area', '52', '%', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6096', 'vertical_support', 'Extruded Aluminum Z-Support', '-', 'GrilleScreens_catalog_ARL.pdf');

add('ENCB6500', 'screen_type', 'Horizontal Blade', '-', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6500', 'depth', '4', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6500', 'material_thickness', '0.081', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6500', 'free_area_4x4_unit', '8.00', 'sq ft', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6500', 'pct_free_area', '50', '%', 'GrilleScreens_catalog_ARL.pdf');
add('ENCB6500', 'vertical_support', 'Extruded Aluminum Z-Support', '-', 'GrilleScreens_catalog_ARL.pdf');

add('SCB601', 'screen_type', 'Horizontal Blade', '-', 'GrilleScreens_catalog_ARL.pdf');
add('SCB601', 'depth', '4', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SCB601', 'material_thickness', '0.081', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SCB601', 'free_area_4x4_unit', '5.65', 'sq ft', 'GrilleScreens_catalog_ARL.pdf');
add('SCB601', 'pct_free_area', '35', '%', 'GrilleScreens_catalog_ARL.pdf');
add('SCB601', 'vertical_support', 'Extruded Aluminum Z-Support', '-', 'GrilleScreens_catalog_ARL.pdf');

// ---- Louver Screens (vertical blade) ----
add('CV605', 'screen_type', 'Vertical Blade', '-', 'GrilleScreens_catalog_ARL.pdf');
add('CV605', 'depth', '5', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('CV605', 'material_thickness', '0.081', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('CV605', 'free_area_4x4_unit', '8.82', 'sq ft', 'GrilleScreens_catalog_ARL.pdf');
add('CV605', 'pct_free_area', '55', '%', 'GrilleScreens_catalog_ARL.pdf');
add('CV605', 'horizontal_support', '2 x 2 x 0.25 in Angle', '-', 'GrilleScreens_catalog_ARL.pdf');

add('SV961', 'screen_type', 'Vertical Blade', '-', 'GrilleScreens_catalog_ARL.pdf');
add('SV961', 'depth', '3.75', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SV961', 'material_thickness', '0.081', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SV961', 'free_area_4x4_unit', '3.84', 'sq ft', 'GrilleScreens_catalog_ARL.pdf');
add('SV961', 'pct_free_area', '24', '%', 'GrilleScreens_catalog_ARL.pdf');
add('SV961', 'horizontal_support', '2 x 2 x 0.25 in Angle', '-', 'GrilleScreens_catalog_ARL.pdf');

add('SV962', 'screen_type', 'Vertical Blade', '-', 'GrilleScreens_catalog_ARL.pdf');
add('SV962', 'depth', '2', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SV962', 'material_thickness', '0.081', 'in', 'GrilleScreens_catalog_ARL.pdf');
add('SV962', 'free_area_4x4_unit', '2.67', 'sq ft', 'GrilleScreens_catalog_ARL.pdf');
add('SV962', 'pct_free_area', '17', '%', 'GrilleScreens_catalog_ARL.pdf');
add('SV962', 'horizontal_support', '2 x 2 x 0.19 in Angle', '-', 'GrilleScreens_catalog_ARL.pdf');

// ---- Sun Controls category-wide ----
add('AIROLITE-SUN-CONTROLS-GENERAL', 'design_load_max', '25', 'psf', 'ASC4_spec_ARL.pdf, ASC6_spec_ARL.pdf');
add('AIROLITE-SUN-CONTROLS-GENERAL', 'design_load_includes', 'Wind, snow (including drift), seismic events, and dead load of the sunshade', '-', 'ASC4_spec_ARL.pdf, ASC6_spec_ARL.pdf');
add('AIROLITE-SUN-CONTROLS-GENERAL', 'max_section_size', '144 wide x 48 projection (with standard fascia; may vary with optional fascia)', 'in', 'ASC4_spec_ARL.pdf, ASC6_spec_ARL.pdf');
add('AIROLITE-SUN-CONTROLS-GENERAL', 'construction', 'Mechanically Fastened standard, Welded optional', '-', 'ASC4_spec_ARL.pdf, ASC6_spec_ARL.pdf');
add('AIROLITE-SUN-CONTROLS-GENERAL', 'anodize_finish_recommendation', 'NOT recommended for Sun Controls, since they use multiple aluminum alloy types (blade alloy 6063-T5 vs outrigger alloy 6061-T6), causing color inconsistencies', '-', 'Finishes_catalog_ARL.pdf footnote 1');
add('AIROLITE-SUN-CONTROLS-GENERAL', 'installation_thermal_expansion_note', 'Outrigger/mullion/pin connections are intentionally sized to allow thermal expansion at jambs and mullions; do not over-tighten with additional washers, which can cause front-of-sunshade sag', '-', 'sun-controls-instruction-manual.pdf');

add('ASC4', 'blade_type', 'Airfoil', '-', 'ASC4_spec_ARL.pdf');
add('ASC4', 'blade_material', 'Extruded Aluminum, Alloy 6063-T5', '-', 'ASC4_spec_ARL.pdf');
add('ASC4', 'blade_thickness', '0.081', 'in', 'ASC4_spec_ARL.pdf');
add('ASC4', 'blade_width', '4', 'in', 'ASC4_spec_ARL.pdf');
add('ASC4', 'blade_spacing', '4 on center', 'in', 'ASC4_spec_ARL.pdf');
add('ASC4', 'outrigger_material', 'Aluminum Plate, Alloy 6061-T6', '-', 'ASC4_spec_ARL.pdf');
add('ASC4', 'outrigger_thickness', '0.250', 'in', 'ASC4_spec_ARL.pdf');
add('ASC4', 'standard_fascia', '3 in Round Tube', '-', 'ASC4_spec_ARL.pdf');
add('ASC4', 'optional_fascia', 'Rectangular Tube, Channel, or None', '-', 'ASC4_spec_ARL.pdf');

add('ASC6', 'blade_type', 'Airfoil', '-', 'ASC6_spec_ARL.pdf');
add('ASC6', 'blade_material', 'Extruded Aluminum, Alloy 6063-T5', '-', 'ASC6_spec_ARL.pdf');
add('ASC6', 'blade_thickness', '0.081', 'in', 'ASC6_spec_ARL.pdf');
add('ASC6', 'blade_width', '6', 'in', 'ASC6_spec_ARL.pdf');
add('ASC6', 'blade_spacing', '6 on center', 'in', 'ASC6_spec_ARL.pdf');
add('ASC6', 'outrigger_material', 'Aluminum Plate, Alloy 6061-T6', '-', 'ASC6_spec_ARL.pdf');
add('ASC6', 'outrigger_thickness', '0.250', 'in', 'ASC6_spec_ARL.pdf');
add('ASC6', 'standard_fascia', '4 in Round Tube', '-', 'ASC6_spec_ARL.pdf');
add('ASC6', 'optional_fascia', 'Rectangular Tube, Channel, or None', '-', 'ASC6_spec_ARL.pdf');

// ---- Finishes (brand-wide, AIROLITE-GENERAL) ----
add('AIROLITE-GENERAL', 'finish_baked_enamel', 'AAMA 2603 compliant, oven-cured, finished-after-assembly; 1 year warranty (aluminum products)', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_2coat_fluoropolymer', 'AAMA 2605 compliant, Kynar 500/Hylar 5000, min 1.2 mils dry film; 10 year warranty (20 year optional)', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_3coat_fluoropolymer', 'AAMA 2605 compliant, Kynar 500/Hylar 5000, min 2.0 mils dry film; 10 year warranty (20 year optional)', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_clear_anodize', 'AAMA 611-98 Class I (AA-M10C21A41), 0.7 mil minimum; 5 year warranty', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_color_anodize', 'AAMA 611-98 Class I (AA-M10C21A44), 0.7 mil minimum, colors: Champagne, Light/Medium/Dark/Extra Dark Bronze, Black; 5 year warranty', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_anodize_caution', 'Anodize finishes not recommended for Sun Controls or other products using multiple types of aluminum alloy, due to color inconsistencies', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_mica_colors_count', '6 standard mica colors, AAMA 2605 compliant (70% Kynar PVDF / 100% Fluoropolymer FEVE)', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_standard_colors_count', '27 standard colors, available in AAMA 2605, 2604, or 2603 compliant coatings', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_prime_coat_caution', 'Airolite does not recommend prime coat or field painting of louvers/architectural products and does not provide field cleaning, preparation, or painting instructions', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_warranty_tier_2605', 'AAMA 2605 (fluoropolymer/Kynar tiers): 10 year warranty (20 year optional), 4,000 hr salt spray resistance, 2,000 hr aggressive cyclical corrosion testing, 10 year South Florida exposure', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_warranty_tier_2604', 'AAMA 2604 (Wood Grain tier): 5 year warranty, 3,000 hr salt spray resistance, 5 year South Florida exposure', '-', 'Finishes_catalog_ARL.pdf');
add('AIROLITE-GENERAL', 'finish_warranty_tier_2603', 'AAMA 2603 (Baked Enamel tier): 1 year warranty, 1,500 hr salt spray resistance, 1 year South Florida exposure', '-', 'Finishes_catalog_ARL.pdf');

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
