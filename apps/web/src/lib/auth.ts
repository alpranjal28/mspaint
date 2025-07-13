
import axios from 'axios';
import { HTTP_BACKEND_URL } from '../../config';

export async function refreshToken() {
  try {
    const response = await axios.post(`${HTTP_BACKEND_URL}/refresh-token`, {}, {
      withCredentials: true, // Send cookies
    });

    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    // Redirect to login or handle error appropriately
    window.location.href = '/signin';
    return false;
  }
}
