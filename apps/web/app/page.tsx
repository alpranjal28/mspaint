import Head from "next/head";
import HamburgerMenu from "../components/hamburgerMenu";

const LandingPage = () => {

  const features = [
    {
      title: "Real-time Collaboration",
      description:
        "Draw together with your team in real-time with WebSocket synchronization",
      icon: "🎨",
    },
    {
      title: "Multiple Tools",
      description:
        "Choose from pencil, shapes, text, and eraser tools to express your ideas",
      icon: "🛠️",
    },
    {
      title: "Selection & Transform",
      description: "Select, move, and resize shapes with precision controls",
      icon: "✏️",
    },
    {
      title: "History Control",
      description: "Undo/Redo support for confident creation",
      icon: "↩️",
    },
    {
      title: "Canvas Navigation",
      description: "Pan and zoom controls for detailed work",
      icon: "🔍",
    },
    {
      title: "Multi-select",
      description: "Select multiple shapes for bulk editing",
      icon: "📦",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <Head>
        <title>MS Paint Clone - Collaborative Drawing Tool</title>
        <meta
          name="description"
          content="Real-time collaborative drawing application"
        />
      </Head>

      {/* Navigation */}
      <nav className="fixed w-full bg-gray-900/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-shrink-0">
              <h1 className="text-white text-2xl font-bold">MSPaint+</h1>
            </div>

            {/* Mobile menu button */}
            <HamburgerMenu/>

            {/* Desktop nav */}
            <div className="hidden md:flex md:items-center md:space-x-8">
              <a
                href="#features"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Features
              </a>
              <a
                href="#try-it"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try It Now
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Collaborative Drawing Made Simple
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Create, collaborate, and share your artwork in real-time with our
            modern drawing tool
          </p>
          <a
            href="#try-it"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Start Drawing Now
          </a>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-4 bg-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Powerful Features for Creative Minds
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Try It Section */}
      <section id="try-it" className="py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-8">
            Ready to Start Creating?
          </h2>
          <a
            href="/draw"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Launch Drawing Board
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-400">
          <p>
            &copy; {new Date().getFullYear()} MSPaint+. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
