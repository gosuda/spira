logos_root := env_var_or_default("LOGOS_ROOT", "/home/alpha/repos-devtool/LoGOs/.outline/worktree/spira-dogfood")
upstream_go := env_var_or_default("UPSTREAM_GO", "/home/linuxbrew/.linuxbrew/bin/go")

export GOROOT := logos_root
export GOTOOLCHAIN := "local"
export PATH := logos_root / "bin" + ":" + env_var("PATH")

gate: build lint test

build:
    logos build ./...

lint:
    logos lint ./...

test:
    logos test -count=1 ./...

eject:
    rm -rf /tmp/spira-eject
    logos eject -o /tmp/spira-eject
    cd /tmp/spira-eject && env -u GOROOT -u GOTOOLCHAIN {{upstream_go}} build ./...
