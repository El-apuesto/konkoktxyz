import { supabase } from '../lib/supabase';

export async function uploadVideo(
  videoBlob: Blob,
  userId: string,
  storyId: string
): Promise<string> {
  const filename = `${userId}/${storyId}/${Date.now()}.webm`;

  const { data, error } = await supabase.storage
    .from('videos')
    .upload(filename, videoBlob, {
      contentType: 'video/webm',
      upsert: false,
    });

  if (error) {
    throw new Error(`Video upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('videos')
    .getPublicUrl(data.path);

  return publicUrl;
}

export async function getUserVideos(userId: string): Promise<Array<{
  id: string;
  title: string;
  video_url: string;
  created_at: string;
  duration: number;
}>> {
  const { data, error } = await supabase
    .from('stories')
    .select('id, title, video_url, created_at, duration')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }

  return data || [];
}

export async function deleteVideo(storyId: string, userId: string): Promise<void> {
  const { data: story } = await supabase
    .from('stories')
    .select('video_url')
    .eq('id', storyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (story?.video_url) {
    const path = story.video_url.split('/').slice(-3).join('/');
    await supabase.storage.from('videos').remove([path]);
  }

  const { error } = await supabase
    .from('stories')
    .delete()
    .eq('id', storyId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete video: ${error.message}`);
  }
}
