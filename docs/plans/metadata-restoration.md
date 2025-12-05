# Metadata restoration

- dispatch **APP_FOREGROUND** `state = RESTORING_STATE`
    - This kicks off state restoration for the UI
    ```python
    if TrackPlayer.state in [Playing, Paused]:
        # get the track id and use this to update the library id
        # get the position from the track player and use this to update the UI
        # we should update the 
        state = PLAYING if TrackPlayer.state == Playing else PAUSED
        setItem(TrackPlayer.track.id)
        setPosition(TrackPlayer.position)
    elif len(TrackPlayer.queue) == 0:
        # get the last track id from async storage
        # get the last position for that track from SQL
        state = IDLE
        setItem(AsyncStorage.item.id)
        setPosition(SQL.position)

    if TrackPlayer.state != Playing:
        fetchLatestPosition(item.id)
    ```
    - This event is ignored on the headless side

- dispatch **APP_BACKGROUND**
    - headless tracks this so we don't try to fetch server progress when we hit play from the background

- dispatch PLAY 
    - This begins the process of playing
    - Fetches the most recent progress from the server and reconciles the start position. This should happen 
    even if we have a current session for this item
