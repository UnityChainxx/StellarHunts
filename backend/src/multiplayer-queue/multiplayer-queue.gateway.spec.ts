import { MultiplayerQueueGateway } from './multiplayer-queue.gateway';
import type { MatchResultDto } from './dto/match-result.dto';

describe('MultiplayerQueueGateway', () => {
  let gateway: MultiplayerQueueGateway;
  let serverMock: {
    emit: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(() => {
    gateway = new MultiplayerQueueGateway();
    serverMock = {
      emit: jest.fn(),
      close: jest.fn((cb?: () => void) => cb && cb()),
    };
    // @WebSocketServer() assigns the Socket.IO server instance at runtime;
    // we simulate that here.
    (gateway as unknown as { server: typeof serverMock }).server = serverMock;
  });

  it('broadcasts a match_found event to all connected clients', () => {
    const match = {
      matchId: 'm1',
      playerIds: ['a', 'b'],
      playerUsernames: ['alice', 'bob'],
    } as MatchResultDto;

    gateway.notifyMatchCreated(match);

    expect(serverMock.emit).toHaveBeenCalledWith('match_found', match);
  });

  it('does not throw when no Socket.IO server is attached yet', () => {
    (gateway as unknown as { server: undefined }).server = undefined;
    expect(() =>
      gateway.notifyMatchCreated({ matchId: 'x' } as MatchResultDto),
    ).not.toThrow();
  });

  it('closes the Socket.IO server on application shutdown', () => {
    gateway.onApplicationShutdown();
    expect(serverMock.close).toHaveBeenCalledTimes(1);
  });

  it('does not throw when closing without a server attached', () => {
    (gateway as unknown as { server: undefined }).server = undefined;
    expect(() => gateway.onApplicationShutdown()).not.toThrow();
  });
});
