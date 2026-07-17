import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBuckets() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('Error listing buckets:', error);
  } else {
    console.log('Buckets:', data.map(b => b.name));
    
    if (!data.find(b => b.name === 'vectores-corte')) {
      console.log('Bucket "vectores-corte" not found, attempting to create...');
      const { data: createData, error: createError } = await supabase.storage.createBucket('vectores-corte', {
        public: true,
        allowedMimeTypes: ['image/svg+xml', 'application/dxf', 'image/png'],
        fileSizeLimit: 10485760 // 10MB
      });
      if (createError) {
        console.error('Error creating bucket:', createError);
      } else {
        console.log('Bucket created successfully!');
      }
    } else {
      console.log('Bucket "vectores-corte" already exists.');
      
      // Asegurar que es público
      await supabase.storage.updateBucket('vectores-corte', {
        public: true,
        allowedMimeTypes: ['image/svg+xml', 'application/dxf', 'image/png']
      });
      console.log('Bucket settings updated to be public.');
    }
  }
}

checkBuckets();
