from redis import Redis
from rq import Worker, Queue
from config import get_settings


def main() -> None:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url)
    queue = Queue("baumagent", connection=redis)
    worker = Worker([queue], connection=redis)
    worker.work()


if __name__ == "__main__":
    main()
