import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Serve signed image URLs for unlocked images
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const filePath = path.join('/');

  // Validate that roomCode and image index are authorized
  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get('room');
  const singlePlayer = searchParams.get('sp') === '1';

  const supabase = createServiceClient();

  if (singlePlayer) {
    // For single player, just sign the URL
    const { data } = await supabase.storage
      .from('case-images')
      .createSignedUrl(filePath, 300); // 5 minutes

    if (!data?.signedUrl) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    return NextResponse.json({ url: data.signedUrl });
  }

  if (!roomCode) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify the image is unlocked in this room
  const { data: room } = await supabase
    .from('rooms')
    .select('revealed_image_count, case_snapshot')
    .eq('code', roomCode)
    .single();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Extract image index from path
  const caseSnapshot = room.case_snapshot as { images: string[] };
  const imageIndex = caseSnapshot.images?.indexOf(`/${filePath}`) ?? -1;

  if (imageIndex === -1) {
    // Try without leading slash
    const idx = caseSnapshot.images?.findIndex(
      (img: string) => img.replace(/^\//, '') === filePath
    );
    if (idx === undefined || idx === -1 || idx >= room.revealed_image_count) {
      return NextResponse.json({ error: 'Image locked' }, { status: 403 });
    }
  } else if (imageIndex >= room.revealed_image_count) {
    return NextResponse.json({ error: 'Image locked' }, { status: 403 });
  }

  const { data } = await supabase.storage
    .from('case-images')
    .createSignedUrl(filePath, 300);

  if (!data?.signedUrl) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
