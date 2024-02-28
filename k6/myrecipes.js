import http from 'k6/http';
import { sleep } from 'k6';
export const options = {
  vus: 2000,
  duration: '300s',
  insecureSkipTLSVerify: true,
};
export default function () {
  http.get('https://www.myrecipes.at');
  sleep(1);
}
