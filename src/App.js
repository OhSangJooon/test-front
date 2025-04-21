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
    { url: 'ws://localhost:7010/rsocket' }, // 첫 번째 인자: options
    BufferEncoders,                         // 두 번째 인자: encoders
);

const metadataSerializer = {
  serialize: (value) => value instanceof Uint8Array ? value : Buffer.from(value),
  deserialize: (value) => value,
};

function App() {
  const [status, setStatus] = useState('대기 중...');
  const [queue, setQueue] = useState([]);
  const [userId, setUserId] = useState('');
  const socketRef = useRef(null);


  // 대기열 진입 시 연결 및 스트림 구독
  const connectQueue = () => {
    if (!userId) {
      alert('사용자 ID를 입력해주세요');
      return;
    }

    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDAxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ0ODk3NDYzLCJleHAiOjE3NDQ5NDA2NjMsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDAwMSJ9.shUHNolZFYt9ri3aqNrURhUQ8kZZfookDsXJEAnxZM0";
    const route = "queue.status";

    // Bearer 접두사를 포함해서 토큰을 생성
    // const authMetadata = Buffer.from("Bearer " + jwt, "utf8");
    const routeMetadata = encodeRoute(route);

    const metadata = encodeCompositeMetadata([
      [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, encodeBearerAuthMetadata(jwt)],
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadata],
    ]);

    // const metadata = encodeCompositeMetadata([
    //   [AUTH_MIME, authMetadata],
    //   [ROUTE_MIME, routeMetadata]
    // ]);

    // 새로 연결한 RSocketClient 생성
    const client = new RSocketClient({
      transport: new RSocketWebSocketClient({ url: 'ws://localhost:7010/rsocket' }),
      setup: {
        dataMimeType: 'application/json',
        metadataMimeType: 'message/x.rsocket.composite-metadata.v0',
        keepAlive: 60000,
        lifetime: 180000,
      },
      serializers: {
        data: JsonSerializer,
        metadata: metadataSerializer,
      },
    });

    client.connect().subscribe({
      onComplete: s => {
        setStatus('✅ RSocket 연결 완료');
        socketRef.current = s;  // 연결된 소켓을 ref에 저장

        s.requestStream({
          data: {
            userId: userId,
            channel: "queue.golf"
          },
          metadata: metadata,
        }).subscribe({
          onSubscribe: sub => {
            console.log('🔗 스트림 구독 시작', sub);
            sub.request(2147483646); // 최대 요청량
          },
          onNext: payload => {
            console.log('✅ 받은 상태:', payload.data);
            setQueue(prev => [...prev, payload.data]);
          },
          onError: error => {
            console.error('❌ 스트림 에러:', error);
            setStatus('❌ 스트림 에러');
          },
          onComplete: () => {
            setStatus('🎉 입장 가능! 스트림 종료');
          },
        });
      },
      onError: error => {
        console.error('❌ 연결 실패:', error);
        setStatus('🚫 연결 실패');
      },
    });
  };

  // 대기열 나가기 시 연결된 소켓을 이용해 exit 요청을 보냄
  const exitQueue = () => {
    if (!socketRef.current) {
      alert('연결이 되어있지 않습니다.');
      return;
    }

    const route = "queue.exit";
    const metadata = String.fromCharCode(route.length) + route;

    socketRef.current.requestResponse({
      data: {
        userId: userId,
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

  /// 테스트 큐
  const testQueue = () => {
    // JWT 토큰과 목적 라우트 지정
    const jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDAxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ1MTY5MTIxLCJleHAiOjE3NDUyMTIzMjEsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDAwMSJ9.E1iEtMbLVAKxoPS4KxnzRXiBp9Ug7Ukrmt4iLofOwyA";
    // const jwtToken = "sadsadawe2@#$@EDWAD@DSAda4e21sad2qC@";
    const route = "queue.status";

    const authMetadataBuffer = encodeBearerAuthMetadata(jwtToken);  // Buffer 또는 Uint8Array
    const routeMetadataBuffer = encodeRoute(route);

    const compositeMetadata = encodeCompositeMetadata([
      [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer],
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadataBuffer],
    ]);

    const setupMetadata = encodeCompositeMetadata([[WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer]]);

    console.log(setupMetadata);

    // RSocket 클라이언트 설정
    const client = new RSocketClient({
      transport,
      setup: {
        dataMimeType: 'application/json', // 'application/json'
        metadataMimeType: 'message/x.rsocket.composite-metadata.v0', // 'message/x.rsocket.composite-metadata.v0'
        keepAlive: 60000,
        lifetime: 180000,
        payload: {
          data: null,
          metadata: setupMetadata
        },
      },
    });

// 클라이언트 연결 및 requestStream 요청 예제
    client.connect().subscribe({
      onComplete: socket => {
        console.log("✅ RSocket 연결 완료");

        // requestStream 요청 - data에는 테스트로 전송할 payload를 넣음
        socket.requestStream({
          data: { userId: "ttt12" },
          metadata: compositeMetadata,
        }).subscribe({
          onSubscribe: sub => {
            console.log("🔗 스트림 구독 시작");
            sub.request(2147483646); // 최대 요청량 전달
          },
          onNext: payload => {
            console.log("✅ 받은 데이터:", payload.data);
          },
          onError: error => {
            console.error("❌ 스트림 에러:", error);
            if(error.source.explanation === "REJECTED_SETUP") {
              console.log("❌ 인증 실패");
            }
          },
          onComplete: () => {
            console.log("🎉 스트림 종료");
          },
        });
      },
      onError: error => {
        console.error("🚫 연결 실패:", error);
      },
    });
  };

  return (
      <div style={{ padding: '2rem' }}>
        <h1>🎯 RSocket 대기열 테스트</h1>
        <div style={{ marginBottom: '1rem' }}>
          <input
              type="text"
              placeholder="사용자 ID 입력"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ marginRight: '0.5rem' }}
          />
          <button onClick={connectQueue}>대기열 진입</button>
          <button onClick={exitQueue}>대기열 나가기</button>
          <button onClick={testQueue}>테스트</button>
        </div>
        <p>📡 연결 상태: <strong>{status}</strong></p>
        <hr />
        <ul>
          {queue.map((q, i) => (
              <li key={i}>순번 {q.position} → {q.status}</li>
          ))}
        </ul>
      </div>
  );
}



export default App;