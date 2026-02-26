import type { Track } from '../../types';
import trpData from './trp.json';

export const tracks: Track[] = [
  trpData as Track,
];

export function getTrackById(id: string): Track | undefined {
  return tracks.find(t => t.id === id);
}

export function getAllTracks(): Track[] {
  return tracks;
}
