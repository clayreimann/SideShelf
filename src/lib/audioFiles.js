/*
    private func urlForTrack(item: LibraryItem, track: AudioTrack) -> URL {
        // TODO: Future server release should include ino with AudioFile or FileMetadata
        let trackPath = track.metadata?.path ?? ""

        var audioFileIno = ""
        if (item.mediaType == "podcast") {
            let podcastEpisodes = item.media?.episodes ?? List<PodcastEpisode>()
            let matchingEpisode = podcastEpisodes.first(where: { $0.audioFile?.metadata?.path == trackPath })
            audioFileIno = matchingEpisode?.audioFile?.ino ?? ""
        } else {
            let audioFiles = item.media?.audioFiles ?? List<AudioFile>()
            let matchingAudioFile = audioFiles.first(where: { $0.metadata?.path == trackPath })
            audioFileIno = matchingAudioFile?.ino ?? ""
        }

        let urlstr = "\(Store.serverConfig!.address)/api/items/\(item.id)/file/\(audioFileIno)/download?token=\(Store.serverConfig!.token)"
        return URL(string: urlstr)!
    }
*/
