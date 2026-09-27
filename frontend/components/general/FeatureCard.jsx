import { Card, CardContent } from "@/components/ui/card";

// FeatureCard displays a single feature/benefit in a glassmorphism-style
// card: a frosted, semi-transparent background with an icon, title, and
// short description, centered vertically.
// Props:
//   - icon: icon element/node rendered above the title
//   - title: short heading text for the feature
//   - description: supporting explanatory text
const FeatureCard = ({ icon, title, description }) => (
  <Card className="backdrop-blur-lg bg-white/10 border-white/20 text-white hover:bg-white/20 transition-colors">
    <CardContent className="p-6">
      <div className="flex flex-col items-center text-center">
        {icon}
        <h3 className="text-xl font-bold mt-4 mb-2">{title}</h3>
        <p className="text-gray-300">{description}</p>
      </div>
    </CardContent>
  </Card>
);

export default FeatureCard;