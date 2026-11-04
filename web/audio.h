#ifndef WEB_AUDIO_H
#define WEB_AUDIO_H
#define WEB_AUDIO_CAPACITY 16
/* Stable scalar IDs for the browser consumer; append, do not renumber. */
enum WebAudioEvent {
    WEB_AUDIO_NONE = 0,
    WEB_AUDIO_PICKUP = 1,
    WEB_AUDIO_LASER_DAMAGE = 2,
    WEB_AUDIO_BOSS_HIT = 3,
    WEB_AUDIO_CORE_HIT = 4,
    WEB_AUDIO_BOSS_EXPLOSION = 5,
    WEB_AUDIO_ROCK_BREAK = 6,
    WEB_AUDIO_ENEMY_EXPLOSION = 7,
    WEB_AUDIO_BOSS_LOCK = 8,
    WEB_AUDIO_BOSS_PHASE = 9,
    WEB_AUDIO_LASER_AIM = 10,
    WEB_AUDIO_MEGA_LASER = 11,
    WEB_AUDIO_BOSS_CHARGE = 12,
    WEB_AUDIO_PLAYER_DAMAGE = 13,
    WEB_AUDIO_REWARD_SPAWN = 14,
    WEB_AUDIO_BOSS_ENTRY = 15,
    WEB_AUDIO_BODY_DAMAGE = 16,
    WEB_AUDIO_EVENT_COUNT = 17
};
/* Compatibility boundary only: never executes a command. Returns 0 if queued,
   -1 for unknown/null commands or a full queue. Unknown commands are rejected. */
int web_audio_system(const char *command);
/* FIFO: returns WEB_AUDIO_NONE when empty. Single main-thread producer/consumer. */
int web_audio_take(void);
void web_audio_clear(void);
#endif
