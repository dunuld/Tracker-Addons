import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  Balance,
  BookingInput,
  DayDetail,
  DayInput,
  HealthResponse,
  MeResponse,
  Project,
  ProjectInput,
  Region,
  Schedule,
  ScheduleInput,
  SetupInput,
  StampInput,
  SummaryResponse,
  User,
  UserSettings,
  WorkPackage,
  WorkPackageInput,
} from '../../../shared/api-types';

/** Zugriff auf die REST-API; Pfade relativ, damit sie unter dem HA-Ingress-Pfad funktionieren. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  health() {
    return this.http.get<HealthResponse>('api/health');
  }

  regions() {
    return this.http.get<Region[]>('api/regions');
  }

  // --- Benutzer ---
  me() {
    return this.http.get<MeResponse>('api/me');
  }
  setup(input: SetupInput) {
    return this.http.post<User>('api/me', input);
  }
  updateSettings(input: Partial<UserSettings>) {
    return this.http.patch<User>('api/me', input);
  }
  balance() {
    return this.http.get<Balance>('api/me/balance');
  }
  schedules() {
    return this.http.get<Schedule[]>('api/me/schedules');
  }
  saveSchedule(input: ScheduleInput) {
    return this.http.post<Schedule[]>('api/me/schedules', input);
  }
  deleteSchedule(id: number) {
    return this.http.delete<void>(`api/me/schedules/${id}`);
  }

  // --- Tage & Stempel ---
  summary(from: string, to: string) {
    return this.http.get<SummaryResponse>('api/summary', { params: { from, to } });
  }
  day(date: string) {
    return this.http.get<DayDetail>(`api/days/${date}`);
  }
  updateDay(date: string, input: DayInput) {
    return this.http.patch<DayDetail>(`api/days/${date}`, input);
  }
  stamp(date: string, time: string) {
    return this.http.post<DayDetail>(`api/days/${date}/stamp`, { time });
  }
  addStamp(date: string, input: StampInput) {
    return this.http.post<DayDetail>(`api/days/${date}/stamps`, input);
  }
  updateStamp(id: number, input: StampInput) {
    return this.http.put<DayDetail>(`api/stamps/${id}`, input);
  }
  deleteStamp(id: number) {
    return this.http.delete<DayDetail>(`api/stamps/${id}`);
  }

  // --- Buchungen ---
  addBooking(date: string, input: BookingInput) {
    return this.http.post<DayDetail>(`api/days/${date}/bookings`, input);
  }
  updateBooking(id: number, input: { quarters?: number; comment?: string | null }) {
    return this.http.put<DayDetail>(`api/bookings/${id}`, input);
  }
  deleteBooking(id: number) {
    return this.http.delete<DayDetail>(`api/bookings/${id}`);
  }

  // --- Projekte ---
  projects() {
    return this.http.get<Project[]>('api/projects');
  }
  createProject(input: ProjectInput) {
    return this.http.post<Project>('api/projects', input);
  }
  updateProject(id: number, input: ProjectInput) {
    return this.http.patch<Project>(`api/projects/${id}`, input);
  }
  deleteProject(id: number) {
    return this.http.delete<void>(`api/projects/${id}`);
  }
  createPackage(projectId: number, input: WorkPackageInput) {
    return this.http.post<WorkPackage>(`api/projects/${projectId}/packages`, input);
  }
  updatePackage(id: number, input: WorkPackageInput) {
    return this.http.patch<WorkPackage>(`api/packages/${id}`, input);
  }
  deletePackage(id: number) {
    return this.http.delete<void>(`api/packages/${id}`);
  }
}
