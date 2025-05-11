import {useRef, useState} from 'react';
import {
  encodeBearerAuthMetadata,
  encodeCompositeMetadata,
  encodeRoute,
  JsonSerializer,
  IdentitySerializer,
  RSocketClient,
  BufferEncoders,
} from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import {WellKnownMimeType} from 'rsocket-composite-metadata';
import { Buffer } from 'buffer';

// npm install rsocket-composite-metadata 해주기

const transport = new RSocketWebSocketClient(
    { url: 'ws://localhost:7010/rsocket' }, // local 테스트
    // { url: 'wss://queue.pass-dev-aptner.com/rsocket' }, // 개발서버
    BufferEncoders,                         // 두 번째 인자: encoders
);

function App() {
  const [status, setStatus] = useState('대기 중...');
  const [queue, setQueue] = useState([]);
  const [totalWating, setTotalWating] = useState(0);
  const [testId, setTestId] = useState("");
  const [testCount, setTestCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const socketRef = useRef(null);
  const retryRef = useRef(0);
  const MAX_RETRY = 3;

  const cleanupSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setStatus('🔌 연결 종료됨');
    }
  };


  // 대기열 진입 시 연결 및 스트림 구독
  const connectQueue = (isRetry:boolean) => {
    if (socketRef.current && !isRetry) {
      console.warn('⏳ 이미 연결 중입니다.');
      return;
    }

    let jwtToken = "";

    if (testId === "m") {
      jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDAxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2OTM5NDA5LCJleHAiOjE3NDY5ODI2MDksImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDAwMSJ9.nXuQrH2lJoitHtksb_i-Ve0aB5Im7Xd2EdznYQZz-j8";
    } else if (testId === "a") {
      jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDQxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2OTM5NDU4LCJleHAiOjE3NDY5ODI2NTgsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDA0MSJ9.lZidPt5MwgEIu9vBV4Ua2vhw9XWmS07hOXeqzahxQu8";
    } else {
      jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMTIxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2OTM5NDI0LCJleHAiOjE3NDY5ODI2MjQsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDEyMSJ9.rtpgqJSU2zRQMNBIZ4TQ32Al8OXLwZp1QJw80hiGCbw";
    }

    const route = "queue.status";
    const data = { channel: "GOLF_FIRST_COME", facilityId: 34 };

    // Bearer 접두사를 포함해서 토큰을 생성
    // const authMetadataBuffer = Buffer.from("Bearer " + jwt, "utf8");
    const authMetadataBuffer = encodeBearerAuthMetadata(jwtToken);  // Buffer 또는 Uint8Array
    const routeMetadataBuffer = encodeRoute(route);

    const compositeMetadata = encodeCompositeMetadata([
      [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer],
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadataBuffer],
    ]);
    const setupMetadata = encodeCompositeMetadata([[WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer]]);

    const dataPayload = Buffer.from(JSON.stringify(data));

    const client = new RSocketClient({
      transport: new RSocketWebSocketClient(
          { url: 'ws://192.168.0.31:7010/rsocket' } // 로컬
          // { url: 'wss://queue.pass-dev-aptner.com/rsocket' }, // 개발서버
          , BufferEncoders
      ),
      setup: {
        dataMimeType: 'application/json',
        metadataMimeType: 'message/x.rsocket.composite-metadata.v0',
        keepAlive: 180000,
        lifetime: 720000,
        payload: {
          data: null,
          metadata: setupMetadata
        },
        serializers: {
          data: JsonSerializer,
          metadata: IdentitySerializer,
        },
      },
    });

    client.connect().subscribe({
      onComplete: socket => {
        setStatus('✅ RSocket 연결 완료');
        socketRef.current = socket;

        const stream = socket.requestStream({
          data: dataPayload,
          metadata: compositeMetadata,
        });

        stream.subscribe({
          onSubscribe: sub => sub.request(2147483647),
          onNext: payload => {
            retryRef.current = 0;
            const payloadData = JSON.parse(payload.data.toString('utf8'));
            setQueue(prev => [...prev, payloadData]);
            setTotalWating(payloadData.totalWaiting);
            console.log(`📦 순번: ${payloadData.position}, 총 대기: ${payloadData.totalWaiting}`);
          },
          onError: error => {
            const errMsg = error.message || '';
            const errData = error.source?.data?.toString?.('utf8') || '';
            console.error('❌ 스트림 오류:', errMsg);

            if (errMsg.includes('REJECTED_SETUP') || errData.includes('UNAUTHORIZED')) {
              console.warn('🚫 인증 실패 - 재연결 중단');
              setStatus('🚫 인증 실패: 재인증 필요');
            }
          },
          onComplete: () => {
            console.log('🎉 스트림 정상 종료');
            retryRef.current = 0;
            setStatus('🎉 입장 가능! 스트림 종료');

            // 하트비트 전송
            sendHeartbeat(jwtToken);

            // TODO. 완료 이후 클라이언트 처리 필요 사항
            //  0. 서버 연결 종료 후 재시도 완료되면 다시 onComplete 호출되는데 이때 이미 리다이렉팅 된 클라이언트는 화면 리다이렉팅 하지 않을 방법
            //  1. 앱에서 백그라운드 진입 시 (홈으로 이동) 5~10분[정책 정의필요] 이후 연결 종료
            //  2. 하트비트 체크를 통해 클라이언트가 살아있는지 확인 죽었다면 연결 종료
            //   -> 하트비트 호출 시점 2회 : onComplete / 결제 창 진입 시
          },
        });

        // 소켓 연결 상태에 대한 구독을 진행 한다 [CLOSED : 소켄 연결 닫힘 CONNECTED : 연결 시도 ERROR : 서버 에러]
        socket.connectionStatus().subscribe({
          onSubscribe: sub => sub.request(2147483647),
          onNext: status => {
            console.log("status : ", status);
            if (status.kind === 'ERROR') {
              console.warn('❌ 서버와의 연결 끊김 감지!');
              setStatus('🔌 서버 연결 끊김');

              if (++retryRef.current < MAX_RETRY) {
                console.log(`서버 에러 감지 소켓 재연결 시도 (${retryRef.current})`);
                setTimeout(() => connectQueue(true), 10000);
              } else {
                console.log(`❌ 스트림 재시도 초과 스트림 종료`);
                setStatus('❌ 스트림 재시도 초과 스트림 종료');
                cleanupSocket();
              }

            } else if(status.kind === 'CLOSED') {
              cleanupSocket(); // 소켓 정리
              console.log(`@@ 클라이언트 소켓 닫음`);
              setStatus('🔌 소켓 닫힘');
            }
          },
          onError: error => {
            console.error('❌ connectionStatus 오류 발생:', error);
          },
        });
      },
      onError: error => {
        console.error(`❌ 연결 실패 (${retryRef.current + 1}/${MAX_RETRY}):`, error);
        cleanupSocket();

        if (++retryRef.current < MAX_RETRY) {
          console.log(`소켓 연결 실패! 소켓 연결 재시도 (${retryRef.current})`);
          setTimeout(() => connectQueue(true), 10000);
        } else {
          setStatus('❌ 최대 재시도 초과');
        }
      },
    });
  };

  const test2 = () => {
    const TEST_USER_COUNT = testCount; // 테스트 수량: 100, 1000, 5000, 10000 등으로 조정 가능
    // const WS_URL = 'wss://queue.pass-dev-aptner.com/rsocket';
    const WS_URL = 'ws://192.168.0.31:7010/rsocket';
    const ROUTE = 'queue.test';
    const CHANNEL = 'GOLF_FIRST_COME';
    const JWT_TOKEN = 'test';

    const generateUserId = () => '12' + Math.floor(100000 + Math.random() * 900000);
    const getRandomLeaveSeconds = () => Math.floor(Math.random() * (60 - 30 + 1)) + 30; // 최소 20초 ~ 60초

    for (let i = 1; i < TEST_USER_COUNT+1; i++) {
      const userId = generateUserId();
      const leaveAfter = getRandomLeaveSeconds();
      const data = { memberId: userId, channel: CHANNEL, facilityId: "34", aptId: "1100000001" };

      const routeMetadata = encodeRoute(ROUTE);
      const authMetadata = encodeBearerAuthMetadata(JWT_TOKEN);

      const compositeMetadata = encodeCompositeMetadata([
        [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadata],
        [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadata],
      ]);

      const setupMetadata = encodeCompositeMetadata([
        [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadata],
      ]);

      // 재연결 로직 변수
      let retryCount = 0;
      const maxRetry = 3;

      function attemptConnection() {
        const client = new RSocketClient({
          transport: new RSocketWebSocketClient({ url: WS_URL }, BufferEncoders),
          setup: {
            dataMimeType: 'application/json',
            metadataMimeType: 'message/x.rsocket.composite-metadata.v0',
            keepAlive: 180000,
            lifetime: 720000,
            payload: {
              data: null,
              metadata: setupMetadata,
            },
            serializers: {
              data: JsonSerializer,
              metadata: IdentitySerializer,
            },
          },
        });


        client.connect().subscribe({
          onComplete: socket => {
            const sub = socket.requestStream({
              data: Buffer.from(JSON.stringify(data)),
              metadata: compositeMetadata,
            });

            const memberPositions = {};

            sub.subscribe({
              onSubscribe: s => s.request(2147483647),
              onNext: payload => {
                retryCount = 0;
                const payloadData = JSON.parse(payload.data.toString('utf8'));
                const { position, totalWaiting } = payloadData;

                if (!memberPositions[userId]) {
                  memberPositions[userId] = { first: position, latest: position };
                } else {
                  memberPositions[userId].latest = position;
                }

                const displayText = `[최초순번: ${memberPositions[userId].first}] 받은 순번: ${position}`;
                setQueue(prev => [...prev, { displayText, ...payloadData }]);
                setTotalWating(totalWaiting);

                console.log(`✅ ${i}번째 유저 순번: ${position}, 대기: ${totalWaiting}`);
              },
              onError: error => {
                console.log(`❌ ${userId} 스트림 에러: ${error.message}`);
              },
              onComplete: () => {
                console.log("완료에 진입함!");
                setSuccessCount(prev => prev + 1);
                testSendHeartbeat(JWT_TOKEN, data, socket)

                setTimeout(() => {
                  socket.close();
                }, leaveAfter * 1000);
              }
            });

            socket.connectionStatus().subscribe({
              onSubscribe: sub => sub.request(2147483647),
              onNext: status => {
                console.log("status : ", status);
                if (status.kind === 'ERROR') {
                  console.warn('❌ 서버와의 연결 끊김 감지!');
                  setStatus('🔌 서버 연결 끊김');

                  if (++retryCount < MAX_RETRY) {
                    console.log(`🔁 ${userId} 재연결 시도 (${retryCount})`);
                    setTimeout(attemptConnection, 10000);
                  } else {
                    console.error(`❌ ${userId} 스트림 재시도 초과`);
                    setFailCount(prev => prev + 1);
                    socket.close();
                  }

                } else if(status.kind === 'CLOSED') {
                  console.log(`@@ 클라이언트 소켓 닫음`);
                  socket.close();
                }
              },
              onError: error => {
                console.error('❌ connectionStatus 오류 발생:', error);
              },
            });
          },
          onError: error => {
            console.error(`연결 실패 (${retryCount + 1}/${maxRetry}):`, error);
            setStatus(`연결 실패, 재시도 중... (${retryCount + 1}/${maxRetry})`);
            if (++retryCount <= maxRetry) {
              setTimeout(attemptConnection, 5000); // 5초 후 재시도
            } else {
              setStatus('최대 재시도 횟수 초과로 연결 포기');
            }
          },
        });
      }


      attemptConnection(); // 최초 연결 시도
    } // 모든 요청은 거의 동시에 발생
  }


  const testSendHeartbeat = (jwtToken: string, data: any, socket: any) => {
    const routeMetadata = encodeRoute("queue.test-heart-beat");
    const authMetadata = encodeBearerAuthMetadata(jwtToken);

    const heartbeatMetadata = encodeCompositeMetadata([
      [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadata],
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadata],
    ]);

    socket.fireAndForget({
      data: Buffer.from(JSON.stringify(data)),
      metadata: heartbeatMetadata,
    });

    console.log("❤️ 하트비트 전송 완료");
  };



  // -------- TEST END

  // 대기열 나가기 시 연결된 소켓을 이용해 exit 요청을 보냄 (호출 예시 - 백엔드 개선 필요)
  const exitQueue = () => {
    if (!socketRef.current) {
      alert('연결이 되어있지 않습니다.');
      return;
    }

    let jwtToken = "";

    if (testId === "m") {
      jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDAxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2OTM5NDA5LCJleHAiOjE3NDY5ODI2MDksImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDAwMSJ9.nXuQrH2lJoitHtksb_i-Ve0aB5Im7Xd2EdznYQZz-j8";
    } else if (testId === "a") {
      jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDQxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2OTM5NDU4LCJleHAiOjE3NDY5ODI2NTgsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDA0MSJ9.lZidPt5MwgEIu9vBV4Ua2vhw9XWmS07hOXeqzahxQu8";
    } else {
      jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMTIxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2OTM5NDI0LCJleHAiOjE3NDY5ODI2MjQsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDEyMSJ9.rtpgqJSU2zRQMNBIZ4TQ32Al8OXLwZp1QJw80hiGCbw";
    }

    const route = "queue.exit";
    const data = { channel: "GOLF_FIRST_COME", facilityId: 34 };

    const authMetadataBuffer = encodeBearerAuthMetadata(jwtToken);  // Buffer 또는 Uint8Array
    const routeMetadataBuffer = encodeRoute(route);

    const compositeMetadata = encodeCompositeMetadata([
      [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer],
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadataBuffer],
    ]);

    const dataPayload = Buffer.from(JSON.stringify(data));

    socketRef.current.requestResponse({
      data: dataPayload,
      metadata: compositeMetadata,
    }).subscribe({
      onNext: payload => {
        console.log("✅ 퇴장 응답:", payload.data);
      },
      onError: error => {
        console.error("❌ 퇴장 처리 에러:", error);
      },
      onComplete: () => {
        console.log("🎉 퇴장 요청 완료");
        // 연결 종료
        socketRef.current.close();
        socketRef.current = null;
        setStatus('대기 중...');
      }
    });
  };

  const sendHeartbeat = (jwtToken: string) => {
    if (!socketRef.current) return;

    const authMetadataBuffer = encodeBearerAuthMetadata(jwtToken);
    const heartbeatRouteMetadata = encodeRoute('queue.heartbeat');

    const heartbeatMetadata = encodeCompositeMetadata([
      [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer],
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, heartbeatRouteMetadata],
    ]);

    socketRef.current.fireAndForget({
      data: null,
      metadata: heartbeatMetadata,
    });

    console.log("❤️ 하트비트 전송 완료");
  };

  const closeSocket = () => {
    cleanupSocket()
  };

  return (
      <div style={{ padding: '2rem' }}>
        <h1>🎯 RSocket 대기열 테스트</h1>
        <div style={{ marginBottom: '1rem' }}>
          <button onClick={() => connectQueue(false)}>대기열 진입</button>
          <button onClick={test2}>대기열 테스트</button>
          <button onClick={exitQueue}>대기열 나가기</button>
          <button onClick={closeSocket}>소켓닫기</button>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <input
              type="text"
              placeholder="사용자 ID 입력"
              value={testCount}
              onChange={(e) => setTestCount(Number(e.target.value))}
              style={{ marginRight: '0.5rem' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <input
              type="text"
              placeholder="테스트구분"
              value={testId}
              onChange={(e) => setTestId(e.target.value)}
              style={{ marginRight: '0.5rem' }}
          />
        </div>
        <p>📡 연결 상태: <strong>{status}</strong></p>
        <p>✅ 총 대기 인원: <strong>{totalWating}</strong></p>
        <p>✅ 성공 횟수: <strong>{successCount}</strong></p>
        <p>❌ 실패 횟수: <strong>{failCount}</strong></p>
        <hr />
        <ul>
          {queue.map((q, i) => (
              <li key={i}>{q.displayText} → {q.status} / 내순위 :  {q.position} / 총 대기인원 : {q.totalWaiting}</li>
          ))}
        </ul>
      </div>
  );
}



export default App;