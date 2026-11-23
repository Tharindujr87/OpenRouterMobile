import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const MAX_PHOTOS = 6;

/** Pick photos and return URIs that survive an app restart. */
export async function pickPhotos(): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: MAX_PHOTOS,
    quality: 0.7,
    base64: Platform.OS === 'web',
  });
  if (result.canceled) return [];

  const saved: string[] = [];
  if (Platform.OS === 'web') {
    for (const asset of result.assets.slice(0, MAX_PHOTOS)) {
      if (asset.base64) saved.push(`data:image/jpeg;base64,${asset.base64}`);
      else if (asset.uri) saved.push(asset.uri);
    }
    return saved;
  }

  const folder = `${FileSystem.documentDirectory}photos/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  for (const asset of result.assets.slice(0, MAX_PHOTOS)) {
    const extension = asset.uri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const destination = `${folder}${name}`;
    await FileSystem.copyAsync({ from: asset.uri, to: destination });
    saved.push(destination);
  }
  return saved;
}

export function parsePhotos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
