import type { Track } from '../../types';
import trpData from './trp.json';

let runtimeTracks: Track[] = [trpData as Track];

export function setTracks(apiTracks: Track[]): void {
  if (apiTracks.length > 0) runtimeTracks = apiTracks;
}

export function getTrackById(id: string): Track | undefined {
  return runtimeTracks.find(t => t.id === id);
}

export function getAllTracks(): Track[] {
  return runtimeTracks;
}
