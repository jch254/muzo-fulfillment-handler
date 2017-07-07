import { mapMode, mapPitchClassToKey } from '../utils';
import MuzoEvent, { GetLyricDataIntent } from '../MuzoEvent';
import MuzoResponse from '../MuzoResponse';

export default async function getLyricDataHandler(
  event: MuzoEvent,
  lyricist: any,
  spotifyApi: any,
): Promise<MuzoResponse> {
  console.log('getLyricDataHandler');

  const geniusSongs: any[] = await lyricist.search((event.currentIntent as GetLyricDataIntent).slots.lyric);
  const fullGeniusSong = await lyricist.song(geniusSongs[0].id, { fetchLyrics: false });

  const spotifyMedia = fullGeniusSong.media.find((media: any) => media.provider === 'spotify');
  const youtubeMedia = fullGeniusSong.media.find((media: any) => media.provider === 'youtube');
  const soundcloudMedia = fullGeniusSong.media.find((media: any) => media.provider === 'soundcloud');
  const samples = fullGeniusSong.song_relationships.find((r: any) => r.type === 'samples').songs;
  const sampledIn = fullGeniusSong.song_relationships.find((r: any) => r.type === 'sampled_in').songs;

  let audioFeatures;
  if (spotifyMedia !== undefined) {
    const spotifyNativeUriParts = spotifyMedia.native_uri.split(':');
    const spotifyTrackId = spotifyNativeUriParts[spotifyNativeUriParts.length - 1];

    const audioFeaturesResponse = await spotifyApi.getAudioFeaturesForTrack(spotifyTrackId);
    audioFeatures = audioFeaturesResponse.body;
  } else {
    const spotifyTracks = await spotifyApi.searchTracks(
      `track:${fullGeniusSong.title} artist:${fullGeniusSong.primary_artist.name}`,
    );

    if (spotifyTracks.body.tracks.total > 0) {
      const spotifyTrack = spotifyTracks.body.tracks.items[0];

      if (spotifyTrack.name === fullGeniusSong.title) {
        const audioFeaturesResponse = await spotifyApi.getAudioFeaturesForTrack(spotifyTrack.id);
        audioFeatures = audioFeaturesResponse.body.track;
      }
    }
  }

  console.log(JSON.stringify(geniusSongs));
  console.log(JSON.stringify(fullGeniusSong));
  console.log(JSON.stringify(audioFeatures));

  let responseMessage = `Title: ${fullGeniusSong.title_with_featured}
Artist: ${fullGeniusSong.primary_artist.name}`;

  if (fullGeniusSong.album !== null) {
    responseMessage += `
Album: ${fullGeniusSong.album.name}`;
  }

  if (fullGeniusSong.release_date !== null) {
    responseMessage += `
Release date: ${fullGeniusSong.release_date}`;
  }

  if (audioFeatures !== undefined) {
    responseMessage += `
BPM: ${audioFeatures.tempo.toFixed(0)}`;
  }

  if (audioFeatures !== undefined) {
    responseMessage += `
Key: ${mapPitchClassToKey(audioFeatures.key)} ${mapMode(audioFeatures.mode)}`;
  }

  if (samples.length > 0) {
    responseMessage += `

Sample${samples.length === 1 ? '' : 's'}
${samples.map((s: any) => `- ${s.full_title}`).join('\n')}`;
  }

  if (sampledIn.length > 0) {
    responseMessage += `

Sampled in
${sampledIn.map((s: any) => `- ${s.full_title}`).join('\n')}`;
  }

  if (fullGeniusSong.producer_artists.length > 0) {
    responseMessage += `

Producer${fullGeniusSong.producer_artists.length === 1 ? '' : 's'}
${fullGeniusSong.producer_artists.map((p: any) => `- ${p.name}`).join('\n')}`;
  }

  if (fullGeniusSong.writer_artists.length > 0) {
    responseMessage += `

Writer${fullGeniusSong.writer_artists.length === 1 ? '' : 's'}
${fullGeniusSong.writer_artists.map((w: any) => `- ${w.name}`).join('\n')}`;
  }

  const attachments = [];

  if (spotifyMedia !== undefined) {
    attachments.push({
      title: fullGeniusSong.title_with_featured.substring(0, 80),
      subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
      imageUrl: fullGeniusSong.song_art_image_url,
      attachmentLinkUrl: spotifyMedia.url,
    });
  }

  attachments.push({
    title: fullGeniusSong.title_with_featured.substring(0, 80),
    subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
    imageUrl: fullGeniusSong.song_art_image_url,
    attachmentLinkUrl: fullGeniusSong.url,
  });

  if (youtubeMedia !== undefined) {
    attachments.push({
      title: fullGeniusSong.title_with_featured.substring(0, 80),
      subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
      imageUrl: fullGeniusSong.song_art_image_url,
      attachmentLinkUrl: youtubeMedia.url,
    });
  }

  if (soundcloudMedia !== undefined) {
    attachments.push({
      title: fullGeniusSong.title_with_featured.substring(0, 80),
      subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
      imageUrl: fullGeniusSong.song_art_image_url,
      attachmentLinkUrl: soundcloudMedia.url,
    });
  }

  const currentLyricDataGeniusSongs = geniusSongs
    .slice(1, Math.min(geniusSongs.length, 11))
    .map(song => ({
      id: song.id,
      titleWithFeatured: song.title_with_featured.substring(0, 80),
      artistName: song.primary_artist.name.substring(0, 80),
      imageUrl: song.header_image_url || song.song_art_image_thumbnail_url,
      url: song.url,
    }));

  return {
    sessionAttributes: {
      currentLyricDataGeniusSongs: JSON.stringify(currentLyricDataGeniusSongs),
    },
    dialogAction: {
      type: 'Close',
      fulfillmentState: 'Fulfilled',
      message: {
        contentType: 'PlainText',
        content: responseMessage,
      },
      responseCard: {
        contentType: 'application/vnd.amazonaws.card.generic',
        version: 1,
        genericAttachments: attachments,
      },
    },
  };
}
