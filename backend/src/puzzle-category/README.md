# Puzzle Category Module

A standalone NestJS module for organizing puzzles into logical categories in StellarHunt. Provides complete CRUD for categories and puzzles with many-to-many relationships, search, filtering, and initial data seeding.

## Features

- **Category Management** — Create, read, update, and soft-delete puzzle categories
- **Puzzle Management** — Full CRUD for puzzles with difficulty classification
- **Many-to-Many Relationships** — Categories can contain multiple puzzles; puzzles can belong to multiple categories
- **Grouped Queries** — `GET /puzzles-by-category` returns puzzles organized under their categories
- **Search and Filter** — Search by title/description, filter by difficulty level
- **Initial Data Seeding** — Pre-configured seed data for five category groups
- **Validation** — Input validation via class-validator decorators
- **Swagger Documentation** — Full API documentation with endpoint schemas
- **Test Coverage** — Unit and E2E tests

## Module Structure

```
puzzle-category/
├── entities/
│   ├── category.entity.ts        # Category database entity
│   └── puzzle.entity.ts          # Puzzle database entity
├── dto/
│   └── puzzle-category.dto.ts    # Data Transfer Objects
├── puzzle-category.service.ts    # Business logic
├── puzzle-category.controller.ts # API endpoints
├── puzzle-category.module.ts     # Module definition
├── puzzle-category.service.spec.ts
└── README.md
```

## Database Schema

### Category Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | Primary key | Unique identifier |
| `name` | String (unique) | Category display name |
| `description` | Text | Category description |
| `slug` | String (unique) | URL-friendly identifier |
| `icon` | String | Emoji or icon representation |
| `color` | String | Hex color code for UI |
| `isActive` | Boolean | Soft delete flag |
| `sortOrder` | Integer | Display ordering |
| `createdAt` | Timestamp | Creation time |
| `updatedAt` | Timestamp | Last update time |
| `puzzles` | Relation | Many-to-many with puzzles |

### Puzzle Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | Primary key | Unique identifier |
| `title` | String | Puzzle title |
| `description` | Text | Puzzle description |
| `difficulty` | Enum | BEGINNER, INTERMEDIATE, ADVANCED, EXPERT |
| `points` | Integer | Points awarded on completion |
| `isActive` | Boolean | Soft delete flag |
| `estimatedTime` | Integer | Estimated minutes to complete |
| `createdAt` | Timestamp | Creation time |
| `updatedAt` | Timestamp | Last update time |
| `categories` | Relation | Many-to-many with categories |

## API Endpoints

### Puzzles Grouped by Category

```
GET /puzzle-categories/puzzles-by-category
```

Returns puzzles organized under their category groups.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Blockchain Basics",
    "description": "Learn blockchain fundamentals",
    "slug": "blockchain-basics",
    "icon": "🔗",
    "color": "#3B82F6",
    "sortOrder": 1,
    "puzzles": [
      {
        "id": 1,
        "title": "What is Blockchain?",
        "description": "Learn about blockchain technology",
        "difficulty": "BEGINNER",
        "points": 10,
        "isActive": true,
        "estimatedTime": 15
      }
    ],
    "puzzleCount": 1
  }
]
```

### Category Endpoints

```
GET    /puzzle-categories/categories                  # List all categories
GET    /puzzle-categories/categories/:id              # Get by ID
GET    /puzzle-categories/categories/slug/:slug       # Get by slug
POST   /puzzle-categories/categories                  # Create category
PUT    /puzzle-categories/categories/:id              # Update category
DELETE /puzzle-categories/categories/:id              # Soft-delete category
```

### Puzzle Endpoints

```
GET    /puzzle-categories/puzzles                     # List all puzzles
GET    /puzzle-categories/puzzles/:id                 # Get by ID
POST   /puzzle-categories/puzzles                     # Create puzzle
PUT    /puzzle-categories/puzzles/:id                 # Update puzzle
DELETE /puzzle-categories/puzzles/:id                 # Soft-delete puzzle
```

### Utility Endpoints

```
GET    /puzzle-categories/categories/:id/puzzles              # Puzzles by category
GET    /puzzle-categories/puzzles/difficulty/:difficulty      # Filter by difficulty
GET    /puzzle-categories/puzzles/search?q=term               # Search puzzles
POST   /puzzle-categories/seed-categories                     # Seed initial data
```

## Initial Categories

The module seeds five pre-configured categories:

| Category | Focus Areas | Color |
|----------|-------------|-------|
| Blockchain Basics | Decentralization, consensus mechanisms, cryptography | `#3B82F6` |
| Smart Contracts | Development, security, gas optimization | `#10B981` |
| StarkNet Deep Dive | Cairo programming, STARK proofs, L2 scaling | `#8B5CF6` |
| NFT Fundamentals | Standards, metadata, IPFS, minting lifecycle | `#F59E0B` |
| DeFi Concepts | Liquidity pools, yield farming, AMMs, protocols | `#EF4444` |

## Usage Examples

### Creating a Category

```typescript
const categoryData = {
  name: 'Advanced Cryptography',
  description: 'Learn advanced cryptographic concepts',
  slug: 'advanced-cryptography',
  icon: ':lock:',
  color: '#6366F1',
  sortOrder: 6,
};

const category = await puzzleCategoryService.createCategory(categoryData);
```

### Creating a Puzzle with Category Associations

```typescript
const puzzleData = {
  title: 'Zero-Knowledge Proofs',
  description: 'Understand ZK proofs and their applications',
  difficulty: 'ADVANCED',
  points: 25,
  estimatedTime: 30,
  categoryIds: [1, 3], // Blockchain Basics + StarkNet Deep Dive
};

const puzzle = await puzzleCategoryService.createPuzzle(puzzleData);
```

### Querying Puzzles by Category

```typescript
const puzzlesByCategory = await puzzleCategoryService.getPuzzlesByCategory();
```

## Validation

- **Category** — Name and slug are required (max 100 characters)
- **Puzzle** — Title and description required; difficulty must be a valid enum value
- **Relationships** — Category IDs must reference existing categories

## Testing

```bash
# Unit tests
npm run test puzzle-category.service.spec.ts

# E2E tests
npm run test:e2e puzzle-category.e2e-spec.ts
```

## Integration

Import the module into any NestJS application:

```typescript
import { PuzzleCategoryModule } from './puzzle-category/puzzle-category.module';

@Module({
  imports: [PuzzleCategoryModule],
})
export class AppModule {}
```

## Environment Variables

No additional variables beyond the standard database configuration:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
DATABASE_NAME=stellarshunt
DATABASE_SYNC=true
DATABASE_LOAD=true
```

## Swagger Documentation

Available at `http://localhost:4000/doc` under the "Puzzle Categories" tag.

## Error Handling

| Status | Scenario |
|--------|----------|
| 404 | Category or puzzle not found |
| 400 | Validation failure |
| 500 | Database or server error |

## Performance

- TypeORM query builder for efficient paginated queries
- Soft deletes maintain referential integrity
- Indexed unique fields (name, slug) for fast lookups
- Optimized many-to-many join queries
