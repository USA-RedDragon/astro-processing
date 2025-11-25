import axios from 'axios';

const baseURL = 'http://localhost:8080/api/v1';

const instance = axios.create({
  baseURL,
  withCredentials: false,
});

instance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default instance;
