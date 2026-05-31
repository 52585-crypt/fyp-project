# RapidAssist Project Documentation Draft

## Project Title

RapidAssist: Roadside Assistance and Verified Service Provider Platform

## Project Overview

RapidAssist is a mobile and web-based roadside assistance system designed for users in Pakistan who need quick help for vehicle-related emergencies. The system connects customers with nearby verified service providers for mechanic support, fuel delivery, and car towing.

The project includes three main applications:

- Mobile app for customers and service providers.
- Backend API for authentication, vehicles, service requests, provider matching, chat, and admin data.
- Admin panel for platform monitoring and provider verification.

## Problem Statement

Vehicle owners in Pakistan often face difficulty finding reliable roadside help during emergencies. Local mechanics and service providers may not always have formal certifications, and customers usually depend on word of mouth, guesswork, or nearby workshops. This creates trust, safety, pricing, and service quality problems.

RapidAssist addresses this issue by collecting multiple trust signals from providers instead of relying only on certificates. These signals include identity documents, selfie verification, workshop or driving licence evidence, live location, admin approval, ratings, completed jobs, and complaint history.

## Objectives

- Provide a digital platform for roadside assistance requests.
- Allow users to request mechanic service, fuel delivery, or towing.
- Match users with nearby verified and online providers.
- Support provider verification through practical evidence.
- Maintain service history, status tracking, chat, ratings, and earnings.
- Give admins a dashboard to monitor users, providers, vehicles, and requests.

## Main Users

### Customer

The customer can register, log in, manage vehicles, create service requests, track request progress, chat with the assigned provider, approve extra mechanic work, complete a job, and submit a rating.

### Service Provider

The provider can register as a mechanic, fuel delivery rider, or towing driver. During registration, the provider submits identity and service-related documents. After admin verification, the provider can go online, update location, view open requests, accept matching jobs, update request status, chat with customers, and view history and earnings.

### Admin

The admin can view platform statistics, recent requests, pending providers, and provider verification details. The admin can approve, reject, or mark a provider as pending after reviewing submitted evidence.

## Technology Stack

### Mobile App

- Expo
- React Native
- Expo Router
- React Navigation
- Redux Toolkit
- React Native Paper
- Axios
- Socket.IO client
- Expo Location
- Expo Image Picker
- Expo Secure Store

### Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT authentication
- HTTP-only auth cookie support
- bcrypt password hashing
- CORS and Morgan middleware

### Admin Panel

- React
- Vite
- React Router
- Axios

## System Architecture

RapidAssist follows a client-server architecture.

The mobile app communicates with the backend API for login, registration, vehicle management, request creation, provider discovery, request status updates, chat, reviews, provider availability, and earnings.

The admin panel also communicates with the backend API. It is used for dashboard statistics and manual provider verification.

MongoDB stores users, provider profiles, vehicles, service requests, status timelines, chat messages, reviews, ratings, provider state, and verification data.

## Authentication

The backend supports user registration, login, current user lookup, and logout.

Main endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

The system supports two roles:

- `user`
- `mechanic`

Although the backend role is named `mechanic`, the provider profile can represent three service categories:

- `mechanic`
- `fuel_delivery`
- `towing`

JWT tokens are returned after login and registration. The backend also supports an HTTP-only cookie named `rapidassist_access_token`.

## Provider Verification Approach

In Pakistan, many local mechanics do not have formal certificates. For this reason, RapidAssist uses a hybrid verification model based on practical evidence and admin review.

The system does not depend only on a certificate. Instead, it collects different verification signals:

- Real-time selfie
- ID card front photo
- ID card back photo
- Workshop photo for mechanics
- Certificate photo for mechanics, when available
- Driving licence photo for fuel delivery and towing providers
- Live location
- Service category
- Admin review status
- Ratings
- Completed jobs
- Complaint count

Provider verification statuses:

- `unverified`
- `pending`
- `verified`
- `rejected`

When a provider registers, their status is set to `pending`. The admin reviews the submitted evidence in the admin panel and can approve or reject the provider. If approved, the provider becomes certified inside the system and can be treated as trusted by the platform.

This approach is suitable for the local Pakistani market because it verifies identity, service evidence, and platform reputation instead of depending only on external certificates.

## Admin Provider Verification Flow

1. Provider registers from the mobile app.
2. Provider uploads required documents based on service category.
3. Backend stores verification data in the provider profile.
4. Admin opens the provider verification screen.
5. Admin reviews selfie, ID card images, workshop photo, certificate, or driving licence.
6. Admin checks provider details such as phone number, service category, rating, completed jobs, identity match status, and live location.
7. Admin sets status to `verified`, `rejected`, or `pending`.

Admin endpoints:

- `GET /api/admin/dashboard`
- `GET /api/admin/providers?status=pending`
- `PATCH /api/admin/providers/:id/verification`

## Vehicle Management

Customers can save their vehicles in the system. A vehicle includes:

- Type
- Make
- Model
- Year
- Registration number

Vehicle endpoints:

- `POST /api/vehicles`
- `GET /api/vehicles`
- `PATCH /api/vehicles/:id`
- `DELETE /api/vehicles/:id`

## Service Request Flow

Customers can create three types of requests:

- Car towing
- Fuel delivery
- Mechanic service

Request categories:

- `car_towing`
- `fuel_delivery`
- `mechanic`

The request stores customer information, vehicle information, pickup location, optional destination location, issue details, photos, estimate, provider assignment, timeline, and review.

Main request endpoints:

- `POST /api/requests`
- `GET /api/requests`
- `GET /api/requests/open`
- `GET /api/requests/nearby-providers`
- `GET /api/requests/:id`
- `PATCH /api/requests/:id/accept`
- `PATCH /api/requests/:id/status`
- `PATCH /api/requests/:id/review`

## Request Status Lifecycle

The backend supports the following request statuses:

- `searching_provider`
- `provider_assigned`
- `provider_on_way`
- `provider_arrived`
- `inspection_started`
- `extra_work_requested`
- `work_started`
- `service_finished`
- `completed`
- `cancelled`

Additional statuses exist for towing and fuel workflows:

- `vehicle_loaded`
- `reached_destination`
- `fuel_delivered`
- `waiting_user_approval`
- `in_progress`

Each status update is stored in a timeline with timestamp, user reference, and optional note.

## Nearby Provider Matching

The system searches for providers who are:

- Registered as service providers.
- Verified by admin.
- Online.
- Not already assigned to an active request.
- Within the search radius.
- Matched to the requested service category.
- Recently active.

Providers are scored using distance, rating, and completed jobs. This helps prioritize nearby and more reliable providers.

Default search radius:

- Mechanic: 5 km
- Fuel delivery: 8 km
- Car towing: 15 km

## Pricing Estimate

The backend generates simple price estimates in PKR.

Examples:

- Towing includes base towing fee, distance charge, and service fee.
- Fuel delivery includes fuel amount, delivery fee, and service fee.
- Mechanic service includes inspection fee and visit fee.

For mechanic jobs, the provider can request extra work approval with part name, part price, labor charge, estimated time, and description. The customer must approve the extra work before it continues.

## Chat

Chat is available after a provider has been assigned to a request. Both the customer and assigned provider can send and read messages for that request.

Chat endpoints:

- `GET /api/requests/:id/messages`
- `POST /api/requests/:id/messages`

## Reviews and Ratings

After a request is completed, the customer can submit a rating from 1 to 5 and an optional comment. The backend updates the provider's average rating and rating count.

This creates a long-term trust score for local providers, which is important where formal certification may not be available.

## Provider Availability and Earnings

Providers can go online or offline and update their live location. The system uses this location for nearby provider discovery.

Provider endpoints:

- `PATCH /api/requests/provider/availability`
- `PATCH /api/requests/provider/location`
- `GET /api/requests/provider/active`
- `GET /api/requests/provider/history`
- `GET /api/requests/provider/earnings`

Provider earnings are calculated from completed requests. The backend returns today's earnings, weekly earnings, total earnings, completed jobs, and recent completed requests.

## Admin Dashboard

The admin dashboard shows:

- Total customers
- Total providers
- Total vehicles
- Active requests
- Completed requests
- Cancelled requests
- Pending providers
- Today's requests
- Online providers
- Revenue
- Reviewed requests
- Average rating
- Recent requests
- Request category breakdown
- Request status breakdown

## Database Models

### User

Stores account data, role, phone, password hash, verification status, mechanic profile, rating, completed jobs, complaint count, and provider state.

### Vehicle

Stores customer vehicle information.

### ServiceRequest

Stores roadside assistance request data, provider assignment, service category, locations, issue details, estimate, status timeline, completion data, and review.

### ChatMessage

Stores request chat messages between customer and provider.

## Security Considerations

- Passwords are hashed using bcrypt.
- JWT authentication protects private endpoints.
- Auth cookie is HTTP-only.
- Protected routes require valid authentication.
- Vehicle access is restricted to the vehicle owner.
- Request access is restricted to the customer, assigned provider, or matching open provider.
- Admin verification actions update provider status from the backend.

## Limitations

- Provider identity matching is currently stored as pending and requires a face-match or OCR provider for automated verification.
- Mechanic certificate validation cannot be fully automated because many local mechanics in Pakistan do not have formal certificates.
- Uploaded provider images are stored as base64 data URIs, which is simple for FYP but not ideal for large-scale production.
- Admin authentication should be strengthened before production deployment.
- Real-time socket events are included as a dependency area but should be fully documented after final socket behavior is confirmed.

## Future Enhancements

- Add automated CNIC OCR and selfie face matching.
- Add provider document expiry checks.
- Add complaint management and dispute handling.
- Add payment gateway integration.
- Add push notifications for request updates.
- Store images in cloud storage instead of MongoDB base64 fields.
- Add stronger admin authentication and role permissions.
- Add provider performance scoring with cancellation rate, response time, and customer complaints.

## Conclusion

RapidAssist provides a practical roadside assistance platform for Pakistan. The project focuses not only on service booking but also on trust and verification. Since many local mechanics may not have certificates, the system verifies providers through identity documents, service evidence, location, admin approval, ratings, and job history. This makes the platform more realistic for the local market and improves customer confidence during roadside emergencies.
