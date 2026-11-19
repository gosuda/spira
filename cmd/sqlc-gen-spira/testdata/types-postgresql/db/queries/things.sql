-- name: GetThing :one
SELECT id, mood, maybe_mood, flags, ratio, price, uid, payload, blob, day, stamp,
       small, medium, big, short_txt, fixed_txt, real_num, dbl, f4, i8, i2,
       serial_col, bigserial_col, note
FROM things
WHERE id = $1;
