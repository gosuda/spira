CREATE TABLE users (id integer primary key, name text not null);
CREATE TABLE posts (id integer primary key, user_id integer not null, title text not null);
