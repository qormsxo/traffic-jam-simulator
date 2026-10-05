/** 먼저 들어온 순서로 빼는 대기열. */
export class Fifo<T> {
  private items: T[] = [];

  /** 대기 중인 개수를 돌려줌. */
  get length(): number {
    return this.items.length;
  }

  /** 맨 뒤에 넣음. */
  enqueue(item: T): void {
    this.items.push(item);
  }

  /** 맨 앞을 빼지 않고 봄. */
  peek(): T | undefined {
    return this.items[0];
  }

  /** 맨 앞을 빼서 돌려줌. */
  dequeue(): T | undefined {
    return this.items.shift();
  }

  /** 앞부터 복사본 배열을 만듦. */
  toArray(): T[] {
    return this.items.slice();
  }

  /** 대기열을 비움. */
  clear(): void {
    this.items = [];
  }
}
