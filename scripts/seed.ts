import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  const casesDir = path.join(__dirname, '..', 'data', 'cases');
  const files = fs.readdirSync(casesDir).filter((f) => f.endsWith('.json'));

  console.log(`Found ${files.length} case files`);

  for (const file of files) {
    const filePath = path.join(casesDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const caseData = JSON.parse(raw);

    const record = {
      id: caseData.id,
      title: caseData.title,
      difficulty: caseData.difficulty,
      status: caseData.status || 'draft',
      brief: caseData.brief,
      truth: caseData.truth,
      images: caseData.images,
      image_meta: caseData.imageMeta,
      key_facts: caseData.keyFacts,
      red_herrings: caseData.redHerrings,
      hints: caseData.hints,
    };

    // Check if exists
    const { data: existing } = await supabase
      .from('cases')
      .select('id')
      .eq('id', record.id)
      .single();

    if (existing) {
      console.log(`  Updating: ${record.id}`);
      const { error } = await supabase
        .from('cases')
        .update(record)
        .eq('id', record.id);
      if (error) {
        console.error(`  Error updating ${record.id}:`, error.message);
      }
    } else {
      console.log(`  Inserting: ${record.id}`);
      const { error } = await supabase.from('cases').insert(record);
      if (error) {
        console.error(`  Error inserting ${record.id}:`, error.message);
      }
    }
  }

  console.log('Seed complete!');
}

seed().catch(console.error);
