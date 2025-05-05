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
  const connectQueue = () => {
    if (socketRef.current) {
      console.warn('⏳ 이미 연결 중입니다.');
      return;
    }

    const jwtToken = "1eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDAxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2MDgxNTI2LCJleHAiOjE3NDYxMjQ3MjYsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDAwMSJ9.Zt-1RPFKnOn0yTM2G_QHNTNmsdlfPjUa6f84pJgy60k";
    const route = "queue.status";
    const data = { channel: "golf-first", facilityId: 10000001 };

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
          { url: 'ws://localhost:7010/rsocket' }
          // { url: 'wss://queue.pass-dev-aptner.com/rsocket' }, // 개발서버
          , BufferEncoders
      ),
      setup: {
        dataMimeType: 'application/json',
        metadataMimeType: 'message/x.rsocket.composite-metadata.v0',
        keepAlive: 60000,
        lifetime: 180000,
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

            if (errMsg.includes('REJECTED_SETUP') || errData.includes('UNAUTHORIZED')) {
              console.warn('🚫 인증 실패 - 재연결 중단');
              setStatus('🚫 인증 실패: 재인증 필요');
              cleanupSocket();
              return;
            }

            console.error('❌ 스트림 오류:', errMsg);
            cleanupSocket();

            if (++retryRef.current < MAX_RETRY) {
              console.log(`스트림 실패! 소켓 재연결 시도 (${retryRef.current})`);
              setTimeout(connectQueue, 3000);
            } else {
              setStatus('❌ 스트림 재시도 초과 스트림 종료');
              cleanupSocket();
            }
          },
          onComplete: () => {
            console.log('🎉 스트림 정상 종료');
            retryRef.current = 0;
            setStatus('🎉 입장 가능! 스트림 종료');
          },
        });
      },
      onError: error => {
        console.error(`❌ 연결 실패 (${retryRef.current + 1}/${MAX_RETRY}):`, error);
        cleanupSocket();

        if (++retryRef.current < MAX_RETRY) {
          console.log(`소켓 연결 실패! 소켓 연결 재시도 (${retryRef.current})`);
          setTimeout(connectQueue, 3000);
        } else {
          setStatus('❌ 최대 재시도 초과');
        }
      },
    });
  };

  const test2 = () => {
    const TEST_USER_COUNT = testCount; // 테스트 수량: 100, 1000, 5000, 10000 등으로 조정 가능
    const WS_URL = 'ws://localhost:7010/rsocket';
    const ROUTE = 'queue.test';
    const CHANNEL = 'GOLF_FIRST_COME';
    const JWT_TOKEN = 'test';

    const generateUserId = () => '11' + Math.floor(100000 + Math.random() * 900000);
    const getRandomLeaveSeconds = () => Math.floor(Math.random() * (60 - 30 + 1)) + 30; // 최소 20초 ~ 60초

    for (let i = 1; i < TEST_USER_COUNT+1; i++) {
      const userId = generateUserId();
      const leaveAfter = getRandomLeaveSeconds();
      const data = { memberId: userId, channel: CHANNEL, facilityId: "10000001", aptId: "11111001" };

      const authMetadataBuffer = encodeBearerAuthMetadata(JWT_TOKEN);
      const routeMetadataBuffer = encodeRoute(ROUTE);

      const compositeMetadata = encodeCompositeMetadata([
        [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadataBuffer],
      ]);
      const setupMetadata = encodeCompositeMetadata([
        [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer],
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
            keepAlive: 10000,
            lifetime: 30000,
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

            sub.subscribe({
              onSubscribe: s => s.request(2147483647),
              onNext: payload => {
                const payloadData = JSON.parse(payload.data.toString('utf8'));
                setQueue(prev => [...prev, payloadData]);
                const totWating = payloadData.totalWaiting;
                setTotalWating(p => totWating);
                console.log(`✅ ${i} 번째 회원 순번 : ${payloadData.position}, 총 대기 인원 : ${totWating}`);
              },
              onError: error => {
                console.log(`❌ ${userId} 스트림 에러: ${error.message}`);
                if (++retryCount <= MAX_RETRY) {
                  console.log(`🔁 ${userId} 스트림 재시도 ${retryCount}/3`);
                  setTimeout(attemptConnection, 10000); // 소켓 완전 재시작
                } else {
                  console.error(`❌${i} 번째 회원 ${userId} error:`, error);
                  setFailCount(prev => prev + 1);
                  socket.close();
                }
              },
              onComplete: () => {
                console.error("완료에 진입함!");
                setSuccessCount(prev => prev + 1);
                setTimeout(() => {
                  socket.close();
                }, leaveAfter * 1000);
              }
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

  // 대기열 나가기 시 연결된 소켓을 이용해 exit 요청을 보냄 (호출 예시 - 백엔드 개선 필요)
  const exitQueue = () => {
    if (!socketRef.current) {
      alert('연결이 되어있지 않습니다.');
      return;
    }

    const route = "queue.exit";
    const metadata = String.fromCharCode(route.length) + route;

    socketRef.current.requestResponse({
      data: {
        channel: "queue.golf"
      },
      metadata: metadata,
    }).subscribe({
      // onSubscribe: sub => {
      //   console.log('🔗 exit 요청 구독 시작', sub);
      //   sub.request(1);
      // },
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

  return (
      <div style={{ padding: '2rem' }}>
        <h1>🎯 RSocket 대기열 테스트</h1>
        <div style={{ marginBottom: '1rem' }}>
          <button onClick={connectQueue}>대기열 진입</button>
          <button onClick={test2}>대기열 테스트</button>
          <button onClick={exitQueue}>대기열 나가기</button>
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
        <p>📡 연결 상태: <strong>{status}</strong></p>
        <p>✅ 총 대기 인원: <strong>{totalWating}</strong></p>
        <p>✅ 성공 횟수: <strong>{successCount}</strong></p>
        <p>❌ 실패 횟수: <strong>{failCount}</strong></p>
        <hr />
        <ul>
          {queue.map((q, i) => (
              <li key={i}>순번 {q.position} → {q.status} / 총 대기인원 : {q.totalWaiting}</li>
          ))}
        </ul>
      </div>
  );
}



export default App;